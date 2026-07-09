import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import {
  NotificationEvents,
  ProductFavoritedEvent,
  ProductPriceChangedEvent,
  ProductPublishedEvent,
  ReviewCreatedEvent,
  UserFollowedEvent,
  UserSecurityEvent,
  UserVerifiedEvent,
} from './notifications.events';

/**
 * Central translator from domain events to user-facing notifications. Domain
 * services stay decoupled: they just `eventEmitter.emit(...)`, and everything
 * below runs here. Each handler decides the recipient, copy, and type.
 */
@Injectable()
export class NotificationsListener {
  private readonly logger = new Logger(NotificationsListener.name);

  constructor(
    private notifications: NotificationsService,
    private prisma: PrismaService,
  ) {}

  /** `like` — the seller learns someone favorited their product. */
  @OnEvent(NotificationEvents.ProductFavorited, { async: true })
  async onProductFavorited(payload: ProductFavoritedEvent) {
    if (payload.favoritedBy.id === payload.sellerId) return; // self-favorite
    await this.notifications.create({
      userId: payload.sellerId,
      type: 'like',
      title: 'A alguien le interesó tu publicación',
      body: `${payload.favoritedBy.name} añadió "${payload.productTitle}" a favoritos.`,
      avatar: payload.favoritedBy.avatarUrl ?? undefined,
      relatedProductId: payload.productId,
    });
  }

  /** `price` — notify favoriters AND seller's followers when a price drops. */
  @OnEvent(NotificationEvents.ProductPriceChanged, { async: true })
  async onProductPriceChanged(payload: ProductPriceChangedEvent) {
    if (
      payload.oldPrice === undefined ||
      payload.newPrice === undefined ||
      payload.newPrice >= payload.oldPrice
    ) {
      return;
    }

    const [favorites, followers] = await Promise.all([
      this.prisma.favorite.findMany({
        where: { productId: payload.productId },
        select: { userId: true },
      }),
      this.prisma.follower.findMany({
        where: { followedId: payload.sellerId },
        select: { followerId: true },
      }),
    ]);

    const body = `Bajó de ${payload.oldPrice.toLocaleString('es')} a ${payload.newPrice.toLocaleString('es')} XAF: "${payload.productTitle}".`;

    const recipientIds = new Set<string>();
    for (const f of favorites) recipientIds.add(f.userId);
    for (const f of followers) recipientIds.add(f.followerId);
    recipientIds.delete(payload.sellerId);

    await Promise.all(
      [...recipientIds].map((userId) =>
        this.notifications.create({
          userId,
          type: 'price',
          title: 'Bajó el precio de un anuncio',
          body,
          relatedProductId: payload.productId,
        }),
      ),
    );
  }

  /** `follow` — a followed seller published a new product. */
  @OnEvent(NotificationEvents.ProductPublished, { async: true })
  async onProductPublished(payload: ProductPublishedEvent) {
    const followers = await this.prisma.follower.findMany({
      where: { followedId: payload.sellerId },
      select: { followerId: true },
    });
    if (followers.length === 0) return;

    await Promise.all(
      followers.map((f) =>
        this.notifications.create({
          userId: f.followerId,
          type: 'follow',
          title: 'Nueva publicación de un vendedor que sigues',
          body: `${payload.sellerName} publicó "${payload.productTitle}".`,
          avatar: payload.sellerAvatarUrl ?? undefined,
          relatedProductId: payload.productId,
          relatedUserId: payload.sellerId,
        }),
      ),
    );
  }

  /** `verified` — a seller earned the verification badge. */
  @OnEvent(NotificationEvents.UserVerified, { async: true })
  async onUserVerified(payload: UserVerifiedEvent) {
    await this.notifications.create({
      userId: payload.userId,
      type: 'verified',
      title: 'Cuenta verificada',
      body: '¡Felicidades! Tu cuenta está verificada. El distintivo ✓ aumenta la confianza de los compradores.',
    });
  }

  /** `follow` — someone started following the user. */
  @OnEvent(NotificationEvents.UserFollowed, { async: true })
  async onUserFollowed(payload: UserFollowedEvent) {
    await this.notifications.create({
      userId: payload.followedId,
      type: 'follow',
      title: 'Nuevo seguidor',
      body: `${payload.followerName} empezó a seguirte.`,
      avatar: payload.followerAvatarUrl ?? undefined,
      relatedUserId: payload.followerId,
    });
  }

  /** `review` — a seller received a new review. */
  @OnEvent(NotificationEvents.ReviewCreated, { async: true })
  async onReviewCreated(payload: ReviewCreatedEvent) {
    await this.notifications.create({
      userId: payload.sellerId,
      type: 'review',
      title: 'Nueva reseña',
      body: `${payload.authorName} te valoró con ${payload.rating}★.`,
      avatar: undefined,
      relatedUserId: payload.authorId,
    });
  }

  /** `security` — a security-relevant account change (always fires). */
  @OnEvent(NotificationEvents.UserSecurity, { async: true })
  async onUserSecurity(payload: UserSecurityEvent) {
    await this.notifications.create({
      userId: payload.userId,
      type: 'security',
      title: 'Cambio de seguridad en tu cuenta',
      body: payload.summary,
    });
  }
}
