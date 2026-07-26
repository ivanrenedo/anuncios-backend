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
import { Prisma } from '@prisma/client';
import { NotificationEvents } from '../notifications/notifications.events';
import { PLAN_LIMITS, BOOST_PRICE, activePlan } from '../common/plan-limits';
import { UserPlan } from '../users/dto/user-plan.enum';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../upload/storage.service';
import { MediaType } from '@prisma/client';

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
            { seller: { name: { contains: query.trim(), mode: 'insensitive' } } },
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

  async search(input: SearchProductsInput) {
    const where: Prisma.ProductWhereInput = { status: 'active' };

    if (input.query) {
      where.OR = [
        { title: { contains: input.query, mode: 'insensitive' } },
        { description: { contains: input.query, mode: 'insensitive' } },
      ];
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

    // Typo tolerance: when the exact `contains` match comes up short, fall
    // back to trigram similarity on the title (pg_trgm). "iphon" → "iPhone".
    if (input.query && products.length < 5) {
      try {
        const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
          SELECT id
          FROM products
          WHERE similarity(title, ${input.query}) > 0.25
          ORDER BY similarity(title, ${input.query}) DESC
          LIMIT ${take}
        `;
        const found = new Set(products.map((p) => p.id));
        const extraIds = rows.map((r) => r.id).filter((id) => !found.has(id));
        if (extraIds.length > 0) {
          // Keep every non-text filter (category, city, price…) — only the
          // exact-text OR condition is replaced by the similarity match.
          const { ...fuzzyWhere } = where;
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
    // on the counter write.
    if (products.length > 0) {
      void this.prisma.product
        .updateMany({
          where: { id: { in: products.map((p) => p.id) } },
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
    // can trigger it. Skipped entirely when the price didn't actually drop.
    const oldEffective = effectivePrice(product.price, product.discount);
    const newEffective = effectivePrice(updated.price, updated.discount);
    if (newEffective < oldEffective) {
      this.events.emit(NotificationEvents.ProductPriceChanged, {
        productId: updated.id,
        productTitle: updated.title,
        oldPrice: oldEffective,
        newPrice: newEffective,
        sellerId: updated.sellerId,
      });
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
    const urls = product.images.flatMap((i) =>
      [i.url, i.thumbnailUrl].filter(Boolean) as string[],
    );
    await this.storage.deleteFiles(urls);
    return deleted;
  }

  async registerView(id: string, viewerKey?: string) {
    // Without a visitor key we can't dedup — fall back to a plain increment.
    if (!viewerKey) {
      return this.prisma.product.update({
        where: { id },
        data: { views: { increment: 1 } },
      });
    }

    const WINDOW_MS = 6 * 60 * 60 * 1000; // one counted view per visitor / 6h
    const existing = await this.prisma.productView.findUnique({
      where: { productId_viewerKey: { productId: id, viewerKey } },
    });
    const now = new Date();

    if (existing && now.getTime() - existing.viewedAt.getTime() < WINDOW_MS) {
      // Same visitor viewed it recently (refresh, StrictMode double-mount,
      // re-navigation…) — don't inflate the counter.
      return this.prisma.product.findUnique({ where: { id } });
    }

    await this.prisma.productView.upsert({
      where: { productId_viewerKey: { productId: id, viewerKey } },
      create: { productId: id, viewerKey, viewedAt: now },
      update: { viewedAt: now },
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

    const { categoryId, imageUrls, marketplaceDetail, vehicleDetail, propertyDetail, serviceDetail, jobDetail, ...rest } = input;
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
    this.audit.log(adminId, 'delete_image', 'product', image.productId, image.url);

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

    const buckets = new Map<string, number>();
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      buckets.set(d.toISOString().slice(0, 10), 0);
    }
    for (const r of rows) {
      const key = r.viewedAt.toISOString().slice(0, 10);
      if (buckets.has(key)) buckets.set(key, buckets.get(key) + 1);
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

  async boostProduct(id: string, days = 7, adminId?: string) {
    const until = new Date();
    until.setDate(until.getDate() + days);
    const product = await this.prisma.product.update({
      where: { id },
      data: { boostedUntil: until },
      include: FULL_INCLUDE,
    });

    this.events.emit(NotificationEvents.ProductBoosted, {
      productId: product.id,
      productTitle: product.title,
      sellerId: product.sellerId,
      boostedUntil: until,
    });

    // Boosts are sold manually (WhatsApp) — activating one IS the payment.
    await this.prisma.payment.create({
      data: {
        userId: product.sellerId,
        amount: BOOST_PRICE,
        concept: 'boost',
        productId: product.id,
        createdById: adminId ?? null,
      },
    });

    this.audit.log(adminId, 'boost', 'product', id, `${days} días — ${product.title}`);
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

  async autoBump() {
    const now = new Date();
    const premiumCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const starCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const premiumBumped = await this.prisma.product.updateMany({
      where: {
        status: 'active',
        bumpedAt: { lt: premiumCutoff },
        seller: {
          plan: 'PREMIUM',
          OR: [{ planExpiresAt: null }, { planExpiresAt: { gt: now } }],
        },
      },
      data: { bumpedAt: now },
    });

    const starBumped = await this.prisma.product.updateMany({
      where: {
        status: 'active',
        bumpedAt: { lt: starCutoff },
        seller: {
          plan: 'STAR',
          OR: [{ planExpiresAt: null }, { planExpiresAt: { gt: now } }],
        },
      },
      data: { bumpedAt: now },
    });

    return { premiumBumped: premiumBumped.count, starBumped: starBumped.count };
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
