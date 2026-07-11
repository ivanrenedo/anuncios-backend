import { Resolver, Mutation, Args, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdminGuard } from '../auth/guards/admin.guard';
import { BroadcastInput } from './dto/broadcast.input';

/** Recipient batch size — keeps Expo's rate limits happy on large sends. */
const BROADCAST_BATCH = 100;

/**
 * Admin-only broadcasts: marketing campaigns and platform-wide announcements.
 *
 * `marketing` recipients are pre-filtered to users with `notifMarketing = true`
 * (the create() path would drop the rest anyway, but filtering up front avoids
 * creating thousands of rows we'd immediately discard). `system` notifications
 * respect `notifMessages`. Both fan out in chunks to the delivery queue.
 */
@Resolver()
export class NotificationsAdminResolver {
  constructor(
    private notifications: NotificationsService,
    private prisma: PrismaService,
  ) {}

  @Mutation(() => Int)
  @UseGuards(AdminGuard)
  async sendMarketingNotification(
    @Args('input') input: BroadcastInput,
  ): Promise<number> {
    const users = await this.prisma.user.findMany({
      where: { notifMarketing: true, ...this.segmentWhere(input) },
      select: { id: true },
    });
    await this.fanOut(
      users.map((u) => u.id),
      'marketing',
      input,
    );
    return users.length;
  }

  @Mutation(() => Int)
  @UseGuards(AdminGuard)
  async sendSystemNotification(
    @Args('input') input: BroadcastInput,
  ): Promise<number> {
    const users = await this.prisma.user.findMany({
      where: { notifMessages: true, ...this.segmentWhere(input) },
      select: { id: true },
    });
    await this.fanOut(
      users.map((u) => u.id),
      'system',
      input,
    );
    return users.length;
  }

  /** Optional audience segmentation: by plan tier and/or city substring. */
  private segmentWhere(input: BroadcastInput) {
    const where: Record<string, unknown> = {};
    if (input.plan && ['FREE', 'STAR', 'PREMIUM'].includes(input.plan)) {
      where.plan = input.plan;
    }
    if (input.city?.trim()) {
      where.location = { contains: input.city.trim(), mode: 'insensitive' };
    }
    return where;
  }

  /**
   * Create notifications in chunks so a huge broadcast doesn't block the
   * request or blow past the per-tick create budget. Each create() also
   * enqueues its own push job, so there's no separate delivery loop here.
   */
  private async fanOut(
    userIds: string[],
    type: 'marketing' | 'system',
    input: BroadcastInput,
  ) {
    for (let i = 0; i < userIds.length; i += BROADCAST_BATCH) {
      const batch = userIds.slice(i, i + BROADCAST_BATCH);
      await Promise.all(
        batch.map((userId) =>
          this.notifications.createForced({
            userId,
            type,
            title: input.title,
            body: input.body,
            avatar: input.avatar,
            sectionId: input.sectionId,
            filterCat: input.filterCat,
          }),
        ),
      );
    }
  }
}
