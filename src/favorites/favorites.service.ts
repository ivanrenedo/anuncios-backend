import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationEvents } from '../notifications/notifications.events';

@Injectable()
export class FavoritesService {
  constructor(
    private prisma: PrismaService,
    private events: EventEmitter2,
  ) {}

  async toggle(userId: string, productId: string) {
    const existing = await this.prisma.favorite.findUnique({
      where: { userId_productId: { userId, productId } },
    });

    if (existing) {
      await this.prisma.favorite.delete({ where: { id: existing.id } });
      await this.prisma.product.update({
        where: { id: productId },
        data: { favoritesCount: { decrement: 1 } },
      });
      return { added: false };
    }

    // Fetch product + favoriter in one go so the event carries everything the
    // listener needs to build the notification without extra queries.
    const [product, favoriter] = await Promise.all([
      this.prisma.product.findUnique({
        where: { id: productId },
        select: { id: true, title: true, sellerId: true },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, avatarUrl: true },
      }),
    ]);

    await this.prisma.favorite.create({ data: { userId, productId } });
    await this.prisma.product.update({
      where: { id: productId },
      data: { favoritesCount: { increment: 1 } },
    });

    if (product && favoriter) {
      // Fire-and-forget: notification delivery must not block the favorite.
      this.events.emit(NotificationEvents.ProductFavorited, {
        productId: product.id,
        productTitle: product.title,
        favoritedBy: {
          id: favoriter.id,
          name: favoriter.name,
          avatarUrl: favoriter.avatarUrl,
        },
        sellerId: product.sellerId,
      });
    }
    return { added: true };
  }

  async findByUser(userId: string) {
    return this.prisma.favorite.findMany({
      where: { userId },
      include: {
        product: {
          include: { images: true, category: true, seller: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async isFavorited(userId: string, productId: string) {
    const fav = await this.prisma.favorite.findUnique({
      where: { userId_productId: { userId, productId } },
    });
    return !!fav;
  }
}
