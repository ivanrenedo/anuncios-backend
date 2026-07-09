/**
 * Domain events that materialize as in-app notifications. Each domain service
 * emits one of these after a successful write; {@link NotificationsListener}
 * translates them into `notificationsService.create()` calls (or fan-outs).
 *
 * Keeping the payloads here means the emitters only know about plain data —
 * they never depend on the notifications module.
 */

/** A user favorited a product. Notifies the seller. */
export interface ProductFavoritedEvent {
  productId: string;
  productTitle: string;
  favoritedBy: { id: string; name: string; avatarUrl?: string | null };
  sellerId: string;
}

/** A favorited product's price (or discount) changed. Notifies every favoriter. */
export interface ProductPriceChangedEvent {
  productId: string;
  productTitle: string;
  /** Previous effective price (already discount-adjusted), if known. */
  oldPrice?: number;
  /** New effective price (already discount-adjusted), if known. */
  newPrice?: number;
  sellerId: string;
}

/** A seller account was verified. Notifies the seller. */
export interface UserVerifiedEvent {
  userId: string;
}

/** Someone started following a user. Notifies the followed user. */
export interface UserFollowedEvent {
  followerId: string;
  followerName: string;
  followerAvatarUrl?: string | null;
  followedId: string;
}

/** A seller received a new review. Notifies the seller. */
export interface ReviewCreatedEvent {
  reviewId: string;
  rating: number;
  authorId: string;
  authorName: string;
  sellerId: string;
}

/** A security-relevant change was made to a user (role/permission/verified flip). */
export interface UserSecurityEvent {
  userId: string;
  /** Short, human-readable description of what changed. */
  summary: string;
}

/** A seller published a new product. Notifies every follower of that seller. */
export interface ProductPublishedEvent {
  productId: string;
  productTitle: string;
  sellerId: string;
  sellerName: string;
  sellerAvatarUrl?: string | null;
}

/** Event name constants — single source of truth for emitters and listeners. */
export const NotificationEvents = {
  ProductFavorited: 'product.favorited',
  ProductPriceChanged: 'product.price.changed',
  ProductPublished: 'product.published',
  UserVerified: 'user.verified',
  UserFollowed: 'user.followed',
  ReviewCreated: 'review.created',
  UserSecurity: 'user.security',
} as const;
