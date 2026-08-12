/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductInput } from './dto/create-product.input';
import { UpdateProductInput } from './dto/update-product.input';
import { SearchProductsInput } from './dto/search-products.input';
import { MediaType, Prisma } from '@prisma/client';
import { NotificationEvents } from '../notifications/notifications.events';
import { EmailEvents, BoostReceiptEvent } from '../email/email.events';
import {
  PLAN_LIMITS,
  BOOST_PRICES,
  type BoostDuration,
  activePlan,
} from '../common/plan-limits';
import { UserPlan } from '../users/dto/user-plan.enum';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../upload/storage.service';

type BoostBilling = {
  plan: UserPlan;
  duration: BoostDuration;
  basePrice: number;
  amount: number;
  included: boolean;
  includedPerMonth: number;
  usedThisMonth: number;
  remainingThisMonth: number;
  extraDiscountPct: number;
  cycleStartsAt: Date;
  cycleEndsAt: Date;
};

/** Normalize either legacy `imageUrls` (all images) or the newer
 *  `mediaItems` (images + videos with thumbnails) into a single array of
 *  `ProductImage.create` inputs. `mediaItems` wins when both are provided. */
function toImageCreates(
  imageUrls?: string[] | null,
  mediaItems?:
    | { url: string; type?: string; thumbnailUrl?: string | null }[]
    | null,
) {
  if (mediaItems && mediaItems.length > 0) {
    return mediaItems.map((m, i) => ({
      url: m.url,
      sortOrder: i,
      type: m.type === 'video' ? MediaType.video : MediaType.image,
      thumbnailUrl: m.thumbnailUrl ?? null,
    }));
  }
  if (imageUrls && imageUrls.length > 0) {
    return imageUrls.map((url, i) => ({
      url,
      sortOrder: i,
      type: MediaType.image,
      thumbnailUrl: null,
    }));
  }
  return null;
}

const FULL_INCLUDE = {
  seller: true,
  category: { include: { parent: true } },
  images: { orderBy: { sortOrder: 'asc' as const } },
  attributes: true,
  marketplaceDetail: true,
  vehicleDetail: true,
  propertyDetail: true,
  serviceDetail: true,
  jobDetail: true,
};

function applyBoostSort<
  T extends { boostedUntil?: Date | null; bumpedAt?: Date | null },
>(products: T[]): T[] {
  const now = new Date();
  return [...products].sort((a, b) => {
    const aBoosted = a.boostedUntil && new Date(a.boostedUntil) > now ? 1 : 0;
    const bBoosted = b.boostedUntil && new Date(b.boostedUntil) > now ? 1 : 0;
    if (bBoosted !== aBoosted) return bBoosted - aBoosted;
    const aBump = a.bumpedAt ? new Date(a.bumpedAt).getTime() : 0;
    const bBump = b.bumpedAt ? new Date(b.bumpedAt).getTime() : 0;
    return bBump - aBump;
  });
}

/**
 * Accent- and case-insensitive text search across product title, description
 * and seller name. Returns matching product IDs (up to `take`).
 *
 * SCHEMA DEPENDENCIES — update this helper if any of these are renamed:
 *   products.id, products.title, products.description, products.seller_id, products.category_id
 *   users.id, users.name
 *   menus.id, menus.label, menus.parent_id (aka categories in the domain)
 *
 * Every text column probed here has a GIN index on
 * `immutable_unaccent(lower(col)) gin_trgm_ops`, so ILIKE '%q%' stays fast
 * (see the `add_*_trgm_indexes` migrations). The menu match walks one level
 * up so "vehículos" also returns rows in the "Coches" subcategory.
 */
async function matchingIdsByText(
  prisma: PrismaService,
  query: string,
  take: number,
): Promise<string[]> {
  const q = query.trim();
  // Guard: single-character queries would match too broadly and don't benefit
  // from the trigram index anyway (trigrams need 3 chars).
  if (q.length < 2) return [];
  const like = `%${q}%`;

  // Column-name reminders for anyone editing the raw SQL below:
  //   products: `category_id`, `seller_id`     (snake_case, no quotes)
  //   menus:    `"parentId"`                   (camelCase → needs quotes)
  //   Everything else in `menus` is snake_case-free (`label`, `id`).
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT DISTINCT p.id
    FROM products p
    WHERE immutable_unaccent(lower(p.title))       ILIKE immutable_unaccent(lower(${like}))
       OR immutable_unaccent(lower(p.description)) ILIKE immutable_unaccent(lower(${like}))
       OR EXISTS (
         SELECT 1 FROM users u
         WHERE u.id = p.seller_id
           AND immutable_unaccent(lower(u.name)) ILIKE immutable_unaccent(lower(${like}))
       )
       OR EXISTS (
         SELECT 1 FROM menus m
         WHERE m.id = p.category_id
           AND (
             immutable_unaccent(lower(m.label)) ILIKE immutable_unaccent(lower(${like}))
             OR EXISTS (
               SELECT 1 FROM menus parent
               WHERE parent.id = m."parentId"
                 AND immutable_unaccent(lower(parent.label)) ILIKE immutable_unaccent(lower(${like}))
             )
           )
       )
    LIMIT ${take}
  `;

  return rows.map((r) => r.id);
}

@Injectable()
export class ProductsService {
  constructor(
    private prisma: PrismaService,
    private events: EventEmitter2,
    private audit: AuditService,
    private storage: StorageService,
  ) {}

  async findAll(take = 20, skip = 0) {
    const products = await this.prisma.product.findMany({
      where: { status: 'active' },
      include: FULL_INCLUDE,
      orderBy: { bumpedAt: 'desc' },
      take,
      skip,
    });
    return applyBoostSort(products);
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: FULL_INCLUDE,
    });
    if (!product) throw new NotFoundException('Anuncio no encontrado');
    return product;
  }

  /** All products regardless of status — admin panel only. */
  async findAllAdmin(take = 200, skip = 0, query?: string) {
    const where: Prisma.ProductWhereInput = query?.trim()
      ? {
          OR: [
            { title: { contains: query.trim(), mode: 'insensitive' } },
            {
              seller: { name: { contains: query.trim(), mode: 'insensitive' } },
            },
          ],
        }
      : {};
    return this.prisma.product.findMany({
      where,
      include: FULL_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    });
  }

  async search(input: SearchProductsInput, viewerId: string | null = null) {
    const where: Prisma.ProductWhereInput = { status: 'active' };

    // Text search: accent/case-insensitive across title, description and seller
    // name. Done via a raw ID prefilter (see matchingIdsByText); the result
    // constrains `where.id` so the rest of the Prisma query keeps its filters,
    // ordering and pagination untouched.
    if (input.query) {
      // Cap fetch well above any realistic first-page pagination — the exact
      // ordering (bumpedAt/price) is applied by Prisma below on this subset.
      // Si falta la extensión unaccent o los índices trigram (DB sin migración
      // aplicada) el SQL crudo revienta — no queremos dejar el explore vacío
      // por eso, así que caemos a un contains ILIKE plano sobre title.
      try {
        const matchingIds = await matchingIdsByText(
          this.prisma,
          input.query,
          500,
        );
        // `id: { in: [] }` forces zero rows; the trigram fallback below may
        // still add fuzzy matches.
        where.id = { in: matchingIds };
      } catch {
        where.title = { contains: input.query, mode: 'insensitive' };
      }
    }
    if (input.categoryId) {
      const children = await this.prisma.category.findMany({
        where: { parentId: input.categoryId },
        select: { id: true },
      });

      const ids = [input.categoryId, ...children.map((c) => c.id)];
      where.categoryId = ids.length === 1 ? ids[0] : { in: ids };
    }
    if (input.city) where.city = { contains: input.city, mode: 'insensitive' };
    if (input.condition) where.condition = input.condition;
    if (input.priceMin || input.priceMax) {
      where.price = {};
      if (input.priceMin) where.price.gte = input.priceMin;
      if (input.priceMax) where.price.lte = input.priceMax;
    }
    const vehicleWhere: Prisma.VehicleDetailWhereInput = {};
    const propertyWhere: Prisma.PropertyDetailWhereInput = {};
    const relationalFilters: Prisma.ProductWhereInput[] = [];

    if (input.engines?.length) {
      vehicleWhere.engine = { in: input.engines };
    }
    if (input.transmissions?.length) {
      vehicleWhere.transmission = { in: input.transmissions };
    }
    if (input.bedroomsMin && input.bedroomsMin > 0) {
      propertyWhere.bedrooms = { gte: input.bedroomsMin };
    }
    if (input.bathroomsMin && input.bathroomsMin > 0) {
      propertyWhere.bathrooms = { gte: input.bathroomsMin };
    }
    if (input.surfaceMin && input.surfaceMin > 0) {
      propertyWhere.surface = { gte: input.surfaceMin };
    }

    if (Object.keys(vehicleWhere).length > 0) {
      relationalFilters.push({ vehicleDetail: { is: vehicleWhere } });
    }
    if (Object.keys(propertyWhere).length > 0) {
      relationalFilters.push({ propertyDetail: { is: propertyWhere } });
    }
    if (input.offerType) {
      relationalFilters.push({
        serviceDetail: { is: { offerType: input.offerType } },
      });
    }
    if (input.operation) {
      relationalFilters.push({
        OR: [
          { vehicleDetail: { is: { operation: input.operation } } },
          { propertyDetail: { is: { operation: input.operation } } },
        ],
      });
    }
    if (relationalFilters.length > 0) {
      where.AND = relationalFilters;
    }

    const isPriceSort =
      input.sortBy === 'price_asc' || input.sortBy === 'price_desc';
    let orderBy:
      | Prisma.ProductOrderByWithRelationInput
      | Prisma.ProductOrderByWithRelationInput[];
    switch (input.sortBy) {
      case 'price_asc':
        orderBy = [{ price: 'asc' }, { id: 'asc' }];
        break;
      case 'price_desc':
        orderBy = [{ price: 'desc' }, { id: 'asc' }];
        break;
      default:
        orderBy = { bumpedAt: 'desc' };
    }

    const take = input.take ?? 20;
    let products = await this.prisma.product.findMany({
      where,
      include: FULL_INCLUDE,
      orderBy,
      take,
      skip: input.skip ?? 0,
    });

    // Typo tolerance: when the exact match comes up short, fall back to
    // trigram similarity (pg_trgm) on both product title AND seller name.
    // "iphon" → "iPhone"; "juna" → products of any seller named "Juan".
    if (input.query && products.length < 5) {
      try {
        const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
          SELECT p.id
          FROM products p
          LEFT JOIN users u ON u.id = p.seller_id
          WHERE similarity(p.title, ${input.query}) > 0.25
             OR similarity(u.name,  ${input.query}) > 0.25
          ORDER BY GREATEST(
            similarity(p.title, ${input.query}),
            COALESCE(similarity(u.name, ${input.query}), 0)
          ) DESC
          LIMIT ${take}
        `;
        const found = new Set(products.map((p) => p.id));
        const extraIds = rows.map((r) => r.id).filter((id) => !found.has(id));
        if (extraIds.length > 0) {
          // Keep every non-text filter (category, city, price…). Drop the
          // exact-text id filter — extras come from the similarity match.
          const fuzzyWhere: Prisma.ProductWhereInput = { ...where };
          delete fuzzyWhere.id;
          const extras = await this.prisma.product.findMany({
            where: { ...fuzzyWhere, id: { in: extraIds } },
            include: FULL_INCLUDE,
          });
          const rank = new Map(extraIds.map((id, i) => [id, i]));
          extras.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
          products = [...products, ...extras].slice(0, take);
          if (isPriceSort) {
            products = [...products].sort((a, b) => {
              const cmp = Number(a.price) - Number(b.price);
              if (cmp !== 0) return input.sortBy === 'price_asc' ? cmp : -cmp;
              return a.id.localeCompare(b.id);
            });
          }
        }
      } catch {
        // pg_trgm not installed (e.g. restricted managed DB) — exact results only.
      }
    }

    // Search impressions: fire-and-forget so the search response never waits
    // on the counter write. Exclude the viewer's own listings — otherwise a
    // seller browsing Explore inflates their own "Búsquedas" stat.
    const impressionIds = viewerId
      ? products.filter((p) => p.sellerId !== viewerId).map((p) => p.id)
      : products.map((p) => p.id);
    if (impressionIds.length > 0) {
      void this.prisma.product
        .updateMany({
          where: { id: { in: impressionIds } },
          data: { impressions: { increment: 1 } },
        })
        .catch(() => {});
    }

    return isPriceSort ? products : applyBoostSort(products);
  }

  async create(sellerId: string, input: CreateProductInput) {
    const seller = await this.prisma.user.findUnique({
      where: { id: sellerId },
      select: { plan: true, planExpiresAt: true },
    });
    const plan = this.activePlan(seller);
    const limits = PLAN_LIMITS[plan];

    const activeCount = await this.prisma.product.count({
      where: { sellerId, status: 'active' },
    });
    if (activeCount >= limits.maxActiveProducts) {
      throw new BadRequestException(
        `Tu plan ${plan} permite un máximo de ${limits.maxActiveProducts} anuncios activos. Elimina o oculta alguno para publicar otro.`,
      );
    }

    const {
      imageUrls,
      mediaItems,
      attributes,
      marketplaceDetail,
      vehicleDetail,
      propertyDetail,
      serviceDetail,
      jobDetail,
      ...productData
    } = input;

    const imageCreates = toImageCreates(imageUrls, mediaItems);
    if (imageCreates && imageCreates.length > limits.maxImagesPerProduct) {
      throw new BadRequestException(
        `Tu plan ${plan} permite un máximo de ${limits.maxImagesPerProduct} fotos por anuncio.`,
      );
    }

    const product = await this.prisma.product.create({
      data: {
        ...productData,
        sellerId,
        images: imageCreates ? { create: imageCreates } : undefined,
        attributes: attributes ? { create: attributes } : undefined,
        marketplaceDetail: marketplaceDetail
          ? { create: marketplaceDetail }
          : undefined,
        vehicleDetail: vehicleDetail ? { create: vehicleDetail } : undefined,
        propertyDetail: propertyDetail ? { create: propertyDetail } : undefined,
        serviceDetail: serviceDetail ? { create: serviceDetail } : undefined,
        jobDetail: jobDetail ? { create: jobDetail } : undefined,
      },
      include: FULL_INCLUDE,
    });

    this.events.emit(NotificationEvents.ProductPublished, {
      productId: product.id,
      productTitle: product.title,
      sellerId: product.sellerId,
      sellerName: product.seller.name,
      sellerAvatarUrl: product.seller.avatarUrl,
    });

    return product;
  }

  async update(id: string, sellerId: string, input: UpdateProductInput) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Anuncio no encontrado');
    if (product.sellerId !== sellerId)
      throw new ForbiddenException(
        'No tienes permiso para editar este anuncio',
      );

    const incomingMediaCount =
      input.mediaItems?.length ?? input.imageUrls?.length ?? 0;
    if (
      incomingMediaCount > 0 ||
      (input.status === 'active' && product.status !== 'active')
    ) {
      const seller = await this.prisma.user.findUnique({
        where: { id: sellerId },
        select: { plan: true, planExpiresAt: true },
      });
      const plan = this.activePlan(seller);
      const limits = PLAN_LIMITS[plan];

      if (incomingMediaCount > limits.maxImagesPerProduct) {
        throw new BadRequestException(
          `Tu plan permite un máximo de ${limits.maxImagesPerProduct} fotos por anuncio.`,
        );
      }

      // Reactivating a hidden listing counts against the same quota as
      // publishing a new one — otherwise hide/publish/unhide bypasses the cap.
      if (input.status === 'active' && product.status !== 'active') {
        const activeCount = await this.prisma.product.count({
          where: { sellerId, status: 'active' },
        });
        if (activeCount >= limits.maxActiveProducts) {
          throw new BadRequestException(
            `Tu plan ${plan} permite un máximo de ${limits.maxActiveProducts} anuncios activos. Elimina o oculta alguno para reactivar este.`,
          );
        }
      }
    }

    const {
      categoryId,
      imageUrls,
      mediaItems,
      marketplaceDetail,
      vehicleDetail,
      propertyDetail,
      serviceDetail,
      jobDetail,
      ...rest
    } = input;
    const data: any = { ...rest };
    if (categoryId) data.category = { connect: { id: categoryId } };

    let droppedMediaUrls: string[] = [];
    const imageCreates = toImageCreates(imageUrls, mediaItems);
    if (imageCreates) {
      const previous = await this.prisma.productImage.findMany({
        where: { productId: id },
        select: { url: true, thumbnailUrl: true },
      });
      const keptUrls = new Set(imageCreates.map((c) => c.url));
      const keptThumbs = new Set(
        imageCreates.map((c) => c.thumbnailUrl).filter(Boolean) as string[],
      );
      for (const p of previous) {
        if (!keptUrls.has(p.url)) droppedMediaUrls.push(p.url);
        if (p.thumbnailUrl && !keptThumbs.has(p.thumbnailUrl)) {
          droppedMediaUrls.push(p.thumbnailUrl);
        }
      }
      await this.prisma.productImage.deleteMany({ where: { productId: id } });
      data.images = { create: imageCreates };
    }
    if (marketplaceDetail) {
      await this.prisma.marketplaceDetail.deleteMany({
        where: { productId: id },
      });
      data.marketplaceDetail = { create: marketplaceDetail };
    }
    if (vehicleDetail) {
      await this.prisma.vehicleDetail.deleteMany({ where: { productId: id } });
      data.vehicleDetail = { create: vehicleDetail };
    }
    if (propertyDetail) {
      await this.prisma.propertyDetail.deleteMany({ where: { productId: id } });
      data.propertyDetail = { create: propertyDetail };
    }
    if (serviceDetail) {
      await this.prisma.serviceDetail.deleteMany({ where: { productId: id } });
      data.serviceDetail = { create: serviceDetail };
    }
    if (jobDetail) {
      await this.prisma.jobDetail.deleteMany({ where: { productId: id } });
      data.jobDetail = { create: jobDetail };
    }

    const updated = await this.prisma.product.update({
      where: { id },
      data,
      include: FULL_INCLUDE,
    });

    if (droppedMediaUrls.length) {
      await this.storage.deleteFiles(droppedMediaUrls);
    }

    // Notify watchers only on an effective price drop. Effective price is the
    // listed price discounted by `discount` (%), so a change to either field
    // can trigger it. Also stamps `priceReducedUntil` so the "Rebajado hoy"
    // chip lights up for 48h (Star/Premium plans; gate lives in the frontend).
    const oldEffective = effectivePrice(product.price, product.discount);
    const newEffective = effectivePrice(updated.price, updated.discount);
    if (newEffective < oldEffective) {
      const stamped = await this.prisma.product.update({
        where: { id },
        data: {
          priceReducedUntil: new Date(Date.now() + 48 * 60 * 60 * 1000),
        },
        include: FULL_INCLUDE,
      });
      this.events.emit(NotificationEvents.ProductPriceChanged, {
        productId: updated.id,
        productTitle: updated.title,
        oldPrice: oldEffective,
        newPrice: newEffective,
        sellerId: updated.sellerId,
      });
      return stamped;
    }
    return updated;
  }

  async remove(id: string, sellerId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { images: { select: { url: true, thumbnailUrl: true } } },
    });
    if (!product) throw new NotFoundException('Anuncio no encontrado');
    // Owner-only: only the product's seller may delete it.
    if (product.sellerId !== sellerId)
      throw new ForbiddenException(
        'No tienes permiso para eliminar este anuncio',
      );

    const deleted = await this.prisma.product.delete({ where: { id } });
    const urls = product.images.flatMap(
      (i) => [i.url, i.thumbnailUrl].filter(Boolean) as string[],
    );
    await this.storage.deleteFiles(urls);
    return deleted;
  }

  async registerView(id: string, viewerKey?: string) {
    // Sin viewerKey no podemos dedup — fallback a un increment simple sin
    // fila de evento (no distorsiona el chart porque no hay identidad para
    // agrupar; el contador Product.views sí refleja el tráfico anónimo).
    if (!viewerKey) {
      return this.prisma.product.update({
        where: { id },
        data: { views: { increment: 1 } },
      });
    }

    const WINDOW_MS = 6 * 60 * 60 * 1000;
    const now = new Date();

    // v2 Fase 12 — dedup 6h por (product, viewer) SIN unique constraint:
    // buscamos la última visita del viewer con findFirst y comparamos.
    // Fuera de ventana → creamos un evento NUEVO (create, no upsert), para
    // que el chart "Visitas últimos 7 días" cuente eventos reales, no
    // visitantes únicos con timestamp de su última visita.
    const lastView = await this.prisma.productView.findFirst({
      where: { productId: id, viewerKey },
      orderBy: { viewedAt: 'desc' },
      select: { viewedAt: true },
    });

    if (lastView && now.getTime() - lastView.viewedAt.getTime() < WINDOW_MS) {
      // Mismo visitante en menos de 6h (refresh, StrictMode double-mount,
      // re-navigation…) — no inflar el contador y no crear evento.
      return this.prisma.product.findUnique({ where: { id } });
    }

    await this.prisma.productView.create({
      data: { productId: id, viewerKey, viewedAt: now },
    });

    return this.prisma.product.update({
      where: { id },
      data: { views: { increment: 1 } },
    });
  }

  async findBySeller(sellerId: string) {
    return this.prisma.product.findMany({
      where: { sellerId },
      include: FULL_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByCategory(categoryId: string, take = 20, skip = 0) {
    const products = await this.prisma.product.findMany({
      where: { categoryId, status: 'active' },
      include: FULL_INCLUDE,
      orderBy: { bumpedAt: 'desc' },
      take,
      skip,
    });
    return applyBoostSort(products);
  }

  /** Moderation: hide or restore any listing, notifying the seller on hide. */
  async adminSetStatus(
    id: string,
    status: 'active' | 'hide',
    reason?: string,
    adminId?: string,
  ) {
    const product = await this.prisma.product.update({
      where: { id },
      data: { status },
      include: FULL_INCLUDE,
    });

    if (status === 'hide') {
      this.events.emit(NotificationEvents.ProductModerated, {
        productId: product.id,
        productTitle: product.title,
        sellerId: product.sellerId,
        reason,
      });
    }

    this.audit.log(
      adminId,
      status === 'hide' ? 'hide_product' : 'restore_product',
      'product',
      id,
      reason ?? product.title,
    );

    return product;
  }

  /** Admin fix-up of any listing (wrong price/category/typos). No ownership check. */
  async adminUpdate(id: string, input: UpdateProductInput, adminId?: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Anuncio no encontrado');

    const { categoryId, ...rest } = input;
    const data: any = { ...rest };
    if (categoryId) data.category = { connect: { id: categoryId } };

    const updated = await this.prisma.product.update({
      where: { id },
      data,
      include: FULL_INCLUDE,
    });

    this.audit.log(adminId, 'update_product', 'product', id, updated.title);
    return updated;
  }

  /** Remove a single image (e.g. inappropriate photo) without hiding the listing. */
  async adminDeleteImage(imageId: string, adminId?: string) {
    const image = await this.prisma.productImage.findUnique({
      where: { id: imageId },
    });
    if (!image) throw new NotFoundException('Imagen no encontrada');

    await this.prisma.productImage.delete({ where: { id: imageId } });
    await this.storage.deleteFiles([image.url, image.thumbnailUrl]);
    this.audit.log(
      adminId,
      'delete_image',
      'product',
      image.productId,
      image.url,
    );

    return this.prisma.product.findUnique({
      where: { id: image.productId },
      include: FULL_INCLUDE,
    });
  }

  /** A buyer tapped the WhatsApp/call contact button on this listing. */
  async registerContact(id: string) {
    return this.prisma.product.update({
      where: { id },
      data: { contacts: { increment: 1 } },
      include: FULL_INCLUDE,
    });
  }

  /**
   * Unique-visitor views per day across all the seller's listings, for the
   * stats chart. Buckets are keyed by the visitor's *last* view (the dedup
   * table upserts viewedAt), which is a good-enough daily approximation.
   */
  async sellerViewsDaily(sellerId: string, days = 7) {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));

    const rows = await this.prisma.productView.findMany({
      where: {
        viewedAt: { gte: since },
        product: { sellerId },
      },
      select: { viewedAt: true },
    });

    // Bucket por fecha LOCAL. Con toISOString() (UTC) los eventos de hoy caían
    // fuera de rango en servidores TZ>UTC porque `since` local ≠ UTC midnight.
    const localKey = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    const buckets = new Map<string, number>();
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      buckets.set(localKey(d), 0);
    }
    for (const r of rows) {
      const key = localKey(r.viewedAt);
      if (buckets.has(key)) buckets.set(key, buckets.get(key)! + 1);
    }
    return [...buckets.entries()].map(([date, count]) => ({ date, count }));
  }

  async bumpProduct(id: string, adminId?: string) {
    const product = await this.prisma.product.update({
      where: { id },
      data: { bumpedAt: new Date() },
      include: FULL_INCLUDE,
    });
    this.audit.log(adminId, 'bump', 'product', id, product.title);
    return product;
  }

  async myBoostQuota(sellerId: string) {
    return this.boostQuotaFor(sellerId);
  }

  async boostMyProduct(id: string, sellerId: string, days = 7) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Anuncio no encontrado');
    if (product.sellerId !== sellerId) {
      throw new ForbiddenException(
        'No tienes permiso para destacar este anuncio',
      );
    }

    const duration = normalizeBoostDuration(days);
    const billing = await this.calculateBoostBilling(sellerId, duration);
    if (!billing.included) {
      throw new BadRequestException(
        `Ya usaste tus ${billing.includedPerMonth} destacados incluidos este mes. Este destacado cuesta ${billing.amount} XAF${billing.extraDiscountPct > 0 ? ' con descuento aplicado' : ''}.`,
      );
    }

    return this.activateBoost(id, duration, billing, null);
  }

  async boostProduct(id: string, days = 7, adminId?: string) {
    const duration = normalizeBoostDuration(days);
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Anuncio no encontrado');

    const billing = await this.calculateBoostBilling(product.sellerId, duration);
    return this.activateBoost(id, duration, billing, adminId ?? null);
  }

  private async activateBoost(
    id: string,
    duration: BoostDuration,
    billing: BoostBilling,
    adminId: string | null,
  ) {
    const days = Number(duration.replace('d', ''));
    const now = new Date();
    const previous = await this.prisma.product.findUnique({ where: { id } });
    if (!previous) throw new NotFoundException('Anuncio no encontrado');
    if (previous.status !== 'active') {
      throw new BadRequestException('Solo puedes destacar anuncios activos.');
    }

    const startsFrom =
      previous.boostedUntil && previous.boostedUntil > now
        ? previous.boostedUntil
        : now;
    const until = new Date(startsFrom);
    until.setDate(until.getDate() + days);

    const product = await this.prisma.product.update({
      where: { id },
      data: { boostedUntil: until, bumpedAt: now },
      include: FULL_INCLUDE,
    });

    this.events.emit(NotificationEvents.ProductBoosted, {
      productId: product.id,
      productTitle: product.title,
      sellerId: product.sellerId,
      boostedUntil: until,
    });

    const quotaLabel = billing.included
      ? `incluido ${billing.usedThisMonth + 1}/${billing.includedPerMonth}`
      : billing.extraDiscountPct > 0
        ? `extra -${Math.round(billing.extraDiscountPct * 100)}%`
        : 'extra';

    // Boost activations are written to the manual ledger. Amount 0 means the
    // seller consumed one of the monthly boosts included in their plan.
    const payment = await this.prisma.payment.create({
      data: {
        userId: product.sellerId,
        amount: billing.amount,
        concept: 'boost',
        note: `${duration} ${quotaLabel}`,
        productId: product.id,
        createdById: adminId,
      },
    });

    // Invoice / receipt email — dedupe key = paymentId so a double-tap on
    // the admin button doesn't email the seller twice.
    this.events.emit(EmailEvents.BoostReceipt, {
      userId: product.sellerId,
      productId: product.id,
      productTitle: product.title,
      amount: Number(payment.amount),
      paymentId: payment.id,
      boostedUntil: until,
    } as BoostReceiptEvent);

    this.audit.log(
      adminId,
      'boost',
      'product',
      id,
      `${days} días — ${quotaLabel} — ${billing.amount} XAF — ${product.title}`,
    );
    return product;
  }

  /**
   * Cancel an active boost (mistake or refund). Does NOT delete the payment —
   * remove it from the ledger separately if the money was returned.
   */
  async unboostProduct(id: string, adminId?: string) {
    const product = await this.prisma.product.update({
      where: { id },
      data: { boostedUntil: null },
      include: FULL_INCLUDE,
    });
    this.audit.log(adminId, 'unboost', 'product', id, product.title);
    return product;
  }

  /**
   * v2 auto-bump: only re-stamps `bumpedAt` on products the seller has
   * explicitly added to their `AutoBumpSlot` pool (Estrella: up to 3 slots
   * weekly, Premium: up to 5 slots daily). Fase 5 exposes the mutation that
   * lets sellers manage those slots; until then, an empty pool means the
   * seller opted out (or hasn't opted in yet) and no auto-bump happens.
   *
   * Boosted products keep the legacy behavior — a paid boost is a hard
   * commitment we honour independently of any slot pool.
   */
  async autoBump() {
    const now = new Date();
    const weeklyCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const dailyCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const boostedCutoff = new Date(now.getTime() - 60 * 60 * 1000);

    const dailyBumped = await this.bumpBySlotCadence('DAILY', dailyCutoff, now);
    const weeklyBumped = await this.bumpBySlotCadence(
      'WEEKLY',
      weeklyCutoff,
      now,
    );

    const boostedBumped = await this.prisma.product.updateMany({
      where: {
        status: 'active',
        boostedUntil: { gt: now },
        bumpedAt: { lt: boostedCutoff },
      },
      data: { bumpedAt: now },
    });

    return {
      // Keep the legacy field names for compat with the cron logger; the
      // semantic mapping today is Premium→DAILY, Star→WEEKLY.
      premiumBumped: dailyBumped,
      starBumped: weeklyBumped,
      boostedBumped: boostedBumped.count,
    };
  }

  /**
   * v2 (Fase 5). Replace the seller's auto-bump pool with the supplied ordered
   * list of product ids. Cadence is derived from the seller's plan:
   *   - Star    → WEEKLY, up to 3 slots
   *   - Premium → DAILY, up to 5 slots
   *   - Free/Basic → forbidden.
   * Every id must belong to the caller and be active. Passing an empty array
   * clears the pool.
   */
  async setAutoBumpSlots(sellerId: string, productIds: string[]) {
    const user = await this.prisma.user.findUnique({
      where: { id: sellerId },
      select: { id: true, plan: true, planExpiresAt: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const currentPlan = activePlan(user);
    const { autoBumpSlots: max, autoBumpCadence: cadence } =
      PLAN_LIMITS[currentPlan];
    if (max === 0 || cadence == null) {
      throw new BadRequestException(
        'Tu plan actual no incluye auto-bump. Sube a Estrella o Premium.',
      );
    }
    if (productIds.length > max) {
      throw new BadRequestException(
        `Tu plan permite hasta ${max} anuncios en el pool de auto-bump (recibí ${productIds.length}).`,
      );
    }
    if (new Set(productIds).size !== productIds.length) {
      throw new BadRequestException('Los IDs de anuncios no pueden repetirse.');
    }

    if (productIds.length > 0) {
      const owned = await this.prisma.product.findMany({
        where: {
          id: { in: productIds },
          sellerId,
          status: 'active',
        },
        select: { id: true },
      });
      if (owned.length !== productIds.length) {
        throw new BadRequestException(
          'Todos los anuncios del pool deben ser tuyos y estar activos.',
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      // v2 Fase 12 — bump inmediato de las adiciones netas:
      // el cron corre cada hora pero solo re-stampea si bumpedAt < cutoff
      // (24h DAILY, 7d WEEKLY). Sin este bump instantáneo, el vendedor añade
      // un producto al pool y no ve nada durante horas → concluye "no
      // funciona". Solo bumpeamos los NUEVOS del pool (diff), no todos, para
      // no re-inflar en cada save.
      const previous = await tx.autoBumpSlot.findMany({
        where: { userId: sellerId },
        select: { productId: true },
      });
      const previousIds = new Set(previous.map((s) => s.productId));
      const netNew = productIds.filter((id) => !previousIds.has(id));

      await tx.autoBumpSlot.deleteMany({ where: { userId: sellerId } });
      for (const productId of productIds) {
        await tx.autoBumpSlot.create({
          data: { userId: sellerId, productId, cadence },
        });
      }

      if (netNew.length > 0) {
        await tx.product.updateMany({
          where: { id: { in: netNew }, sellerId },
          data: { bumpedAt: new Date() },
        });
      }
    });

    return this.autoBumpSlots(sellerId);
  }

  async autoBumpSlots(sellerId: string) {
    return this.prisma.autoBumpSlot.findMany({
      where: { userId: sellerId },
      orderBy: { createdAt: 'asc' },
      include: {
        product: {
          include: {
            images: { orderBy: { sortOrder: 'asc' } },
            category: { include: { parent: true } },
          },
        },
      },
    });
  }

  private async bumpBySlotCadence(
    cadence: 'DAILY' | 'WEEKLY',
    cutoff: Date,
    now: Date,
  ): Promise<number> {
    // Two-step (find IDs, then updateMany) because Prisma does not support
    // filtering by a nested relation existence combined with an aggregate
    // update in a single query on this schema.
    // v2 Fase 12 — filtro añadido por seller.plan. Sin este filtro, si un
    // vendedor pasaba de Premium → Star (o Star → downgrade Free), sus slots
    // DAILY seguían firing DIARIAMENTE aunque su plan actual no lo permite.
    // Ahora Premium → cadence DAILY, Star → cadence WEEKLY; el resto se
    // ignora hasta que el vendedor re-guarde su pool con la cadencia nueva.
    const expectedPlan = cadence === 'DAILY' ? 'PREMIUM' : 'STAR';
    const slots = await this.prisma.autoBumpSlot.findMany({
      where: {
        cadence,
        product: {
          status: 'active',
          bumpedAt: { lt: cutoff },
          seller: {
            plan: expectedPlan,
            OR: [{ planExpiresAt: null }, { planExpiresAt: { gt: now } }],
          },
        },
      },
      select: { productId: true },
    });
    if (slots.length === 0) return 0;

    const result = await this.prisma.product.updateMany({
      where: { id: { in: slots.map((s) => s.productId) } },
      data: { bumpedAt: now },
    });
    return result.count;
  }

  private async boostQuotaFor(sellerId: string, now = new Date()) {
    const user = await this.prisma.user.findUnique({
      where: { id: sellerId },
      select: {
        plan: true,
        planStartedAt: true,
        planExpiresAt: true,
      },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const plan = activePlan(user);
    const limits = PLAN_LIMITS[plan];
    const { startsAt, endsAt } = currentBoostCycle(user.planStartedAt, now);
    const usedThisMonth = await this.prisma.payment.count({
      where: {
        userId: sellerId,
        concept: 'boost',
        createdAt: { gte: startsAt, lt: endsAt },
      },
    });

    return {
      plan,
      includedPerMonth: limits.includedBoostsPerMonth,
      usedThisMonth,
      remainingThisMonth: Math.max(
        limits.includedBoostsPerMonth - usedThisMonth,
        0,
      ),
      extraDiscountPct: limits.extraBoostDiscountPct,
      cycleStartsAt: startsAt,
      cycleEndsAt: endsAt,
    };
  }

  private async calculateBoostBilling(
    sellerId: string,
    duration: BoostDuration,
    now = new Date(),
  ): Promise<BoostBilling> {
    const quota = await this.boostQuotaFor(sellerId, now);
    const basePrice = BOOST_PRICES[duration];
    const included = quota.remainingThisMonth > 0;
    const amount = included
      ? 0
      : Math.round(basePrice * (1 - quota.extraDiscountPct));

    return {
      ...quota,
      duration,
      basePrice,
      amount,
      included,
    };
  }

  private activePlan(
    user: { plan: string; planExpiresAt: Date | null } | null,
  ): UserPlan {
    return activePlan(user);
  }
}

/**
 * Final price after applying the (optional) percentage discount. Used to tell
 * price-drop notifications from no-ops when either `price` or `discount`
 * changes.
 */
function effectivePrice(
  price: Prisma.Decimal,
  discount: number | null,
): number {
  const base = Number(price);
  if (!discount || discount <= 0) return base;
  return Number((base * (1 - discount / 100)).toFixed(2));
}

function normalizeBoostDuration(days: number): BoostDuration {
  if (days === 3 || days === 7 || days === 30) return `${days}d`;
  throw new BadRequestException(
    'Duración de destacado no válida. Usa 3, 7 o 30 días.',
  );
}

function currentBoostCycle(planStartedAt: Date | null, now: Date) {
  let startsAt = planStartedAt ? new Date(planStartedAt) : new Date(now);
  if (!planStartedAt || startsAt > now) {
    startsAt.setUTCDate(1);
    startsAt.setUTCHours(0, 0, 0, 0);
  } else {
    while (true) {
      const next = addUtcMonths(startsAt, 1);
      if (next > now) break;
      startsAt = next;
    }
  }
  const endsAt = addUtcMonths(startsAt, 1);
  return { startsAt, endsAt };
}

function addUtcMonths(date: Date, months: number) {
  const targetMonth = date.getUTCMonth() + months;
  const targetYear = date.getUTCFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(
    Date.UTC(targetYear, normalizedMonth + 1, 0),
  ).getUTCDate();
  return new Date(
    Date.UTC(
      targetYear,
      normalizedMonth,
      Math.min(date.getUTCDate(), lastDay),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}
