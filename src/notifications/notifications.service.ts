import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationType, User } from '@prisma/client';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { PUB_SUB, NOTIFICATION_CREATED } from './providers/pubsub.provider';
import { PubSub } from 'graphql-subscriptions';
import { DeliveryJobData } from './notifications.processor';

/**
 * Maps a notification type to the user preference that gates it. `security`
 * is intentionally absent — security alerts always fire regardless of prefs.
 */
const TYPE_TO_PREFERENCE: Partial<Record<NotificationType, keyof User>> = {
  marketing: 'notifMarketing',
  price: 'notifOffers',
  // Saved-search alerts are offer-like: the user explicitly asked for them.
  alert: 'notifOffers',
  // Everything social/review/status routes through the "messages" bucket.
  like: 'notifMessages',
  follow: 'notifMessages',
  review: 'notifMessages',
  verified: 'notifMessages',
  report: 'notifMessages',
  system: 'notifMessages',
};

const VALID_TYPES = new Set<string>(Object.values(NotificationType));

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    @Inject(PUB_SUB) private pubSub: PubSub,
    @InjectQueue('notifications-delivery')
    private deliveryQueue: Queue<DeliveryJobData>,
  ) {}

  async findByUser(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async markAsRead(id: string) {
    return this.prisma.notification.update({
      where: { id },
      data: { read: true },
    });
  }

  async markAllAsRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
    return true;
  }

  async remove(id: string) {
    return this.prisma.notification.delete({ where: { id } });
  }

  async removeAll(userId: string) {
    const result = await this.prisma.notification.deleteMany({
      where: { userId },
    });
    return result.count;
  }

  /**
   * Create a notification for a user and fan it out (real-time PubSub +
   * queued device push). Respects the user's notification preferences — a
   * gated type that the user opted out of is dropped silently, except for
   * `security` alerts which always fire.
   */
  async create(data: {
    userId: string;
    type: NotificationType;
    title: string;
    body?: string;
    avatar?: string;
    relatedProductId?: string;
    relatedUserId?: string;
    sectionId?: string;
    filterCat?: string;
  }) {
    this.assertValidType(data.type);

    const prefs = await this.prefsFor(data.userId);
    if (!this.allowedByPrefs(data.type, prefs)) {
      // The user opted out of this category — nothing to send.
      return null;
    }

    const notification = await this.prisma.notification.create({
      data: { ...data, type: data.type },
    });

    // Real-time: deliver to any subscribed client of this user.
    await this.pubSub.publish(NOTIFICATION_CREATED, {
      [NOTIFICATION_CREATED]: notification,
    });

    // Device push: offloaded to the queue so we never block on Expo.
    await this.deliveryQueue.add('send', {
      userId: notification.userId,
      notificationId: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body ?? undefined,
      relatedProductId: notification.relatedProductId ?? undefined,
      relatedUserId: notification.relatedUserId ?? undefined,
      sectionId: notification.sectionId ?? undefined,
      filterCat: notification.filterCat ?? undefined,
    });

    return notification;
  }

  /**
   * Create a notification ignoring the user's preferences. Reserved for admin
   * broadcasts where the recipient set is already pre-filtered (e.g. only
   * users with `notifMarketing = true`) or for security alerts.
   */
  async createForced(data: {
    userId: string;
    type: NotificationType;
    title: string;
    body?: string;
    avatar?: string;
    relatedProductId?: string;
    relatedUserId?: string;
    sectionId?: string;
    filterCat?: string;
  }) {
    this.assertValidType(data.type);

    const notification = await this.prisma.notification.create({
      data: { ...data, type: data.type },
    });

    await this.pubSub.publish(NOTIFICATION_CREATED, {
      [NOTIFICATION_CREATED]: notification,
    });

    await this.deliveryQueue.add('send', {
      userId: notification.userId,
      notificationId: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body ?? undefined,
      relatedProductId: notification.relatedProductId ?? undefined,
      relatedUserId: notification.relatedUserId ?? undefined,
      sectionId: notification.sectionId ?? undefined,
      filterCat: notification.filterCat ?? undefined,
    });

    return notification;
  }

  async unreadCount(userId: string) {
    return this.prisma.notification.count({
      where: { userId, read: false },
    });
  }

  // --- internals -----------------------------------------------------------

  private assertValidType(type: NotificationType) {
    if (!VALID_TYPES.has(type)) {
      throw new Error(`Unknown notification type: ${type as string}`);
    }
  }

  private async prefsFor(
    userId: string,
  ): Promise<Pick<User, 'notifMessages' | 'notifOffers' | 'notifMarketing'>> {
    return (
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          notifMessages: true,
          notifOffers: true,
          notifMarketing: true,
        },
        // A missing user shouldn't happen for a real recipient, but be safe:
        // default to "send everything" rather than blocking delivery.
      }) ?? { notifMessages: true, notifOffers: true, notifMarketing: true }
    );
  }

  private allowedByPrefs(
    type: NotificationType,
    prefs: Pick<User, 'notifMessages' | 'notifOffers' | 'notifMarketing'>,
  ): boolean {
    if (type === 'security') return true; // always
    const prefKey = TYPE_TO_PREFERENCE[type];
    if (!prefKey) return true;
    return Boolean(prefs[prefKey as keyof typeof prefs]);
  }
}
