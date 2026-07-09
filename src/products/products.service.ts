import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductInput } from './dto/create-product.input';
import { UpdateProductInput } from './dto/update-product.input';
import { SearchProductsInput } from './dto/search-products.input';
import { Prisma } from '@prisma/client';
import { NotificationEvents } from '../notifications/notifications.events';

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

@Injectable()
export class ProductsService {
  constructor(
    private prisma: PrismaService,
    private events: EventEmitter2,
  ) {}

  async findAll(take = 20, skip = 0) {
    return this.prisma.product.findMany({
      where: { status: 'active' },
      include: FULL_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    });
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
  async findAllAdmin(take = 200, skip = 0) {
    return this.prisma.product.findMany({
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

    let orderBy: Prisma.ProductOrderByWithRelationInput;
    switch (input.sortBy) {
      case 'price_asc':
        orderBy = { price: 'asc' };
        break;
      case 'price_desc':
        orderBy = { price: 'desc' };
        break;
      default:
        orderBy = { createdAt: 'desc' };
    }

    return this.prisma.product.findMany({
      where,
      include: FULL_INCLUDE,
      orderBy,
      take: input.take ?? 20,
      skip: input.skip ?? 0,
    });
  }

  async create(sellerId: string, input: CreateProductInput) {
    const {
      imageUrls,
      attributes,
      marketplaceDetail,
      vehicleDetail,
      propertyDetail,
      serviceDetail,
      jobDetail,
      ...productData
    } = input;

    const product = await this.prisma.product.create({
      data: {
        ...productData,
        sellerId,
        images: imageUrls
          ? { create: imageUrls.map((url, i) => ({ url, sortOrder: i })) }
          : undefined,
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

    const {
      categoryId,
      imageUrls,
      marketplaceDetail,
      vehicleDetail,
      propertyDetail,
      serviceDetail,
      jobDetail,
      ...rest
    } = input;
    const data: any = { ...rest };
    if (categoryId) data.category = { connect: { id: categoryId } };

    if (imageUrls) {
      await this.prisma.productImage.deleteMany({ where: { productId: id } });
      data.images = { create: imageUrls.map((url, i) => ({ url, sortOrder: i })) };
    }
    if (marketplaceDetail) {
      await this.prisma.marketplaceDetail.deleteMany({ where: { productId: id } });
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
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Anuncio no encontrado');
    // Owner-only: only the product's seller may delete it.
    if (product.sellerId !== sellerId)
      throw new ForbiddenException(
        'No tienes permiso para eliminar este anuncio',
      );

    return this.prisma.product.delete({ where: { id } });
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
    return this.prisma.product.findMany({
      where: { categoryId, status: 'active' },
      include: FULL_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    });
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
