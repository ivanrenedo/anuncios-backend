import {
  Resolver,
  Query,
  Mutation,
  Args,
  Int,
  Subscription,
} from '@nestjs/graphql';
import { UseGuards, Inject } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';
import { NotificationModel } from './dto/notification.model';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { GetCurrentUserId } from '../auth/decorators/current-user.decorator';
import { PUB_SUB, NOTIFICATION_CREATED } from './providers/pubsub.provider';
import { PubSub } from 'graphql-subscriptions';

@Resolver(() => NotificationModel)
export class NotificationsResolver {
  constructor(
    private service: NotificationsService,
    private push: PushService,
    @Inject(PUB_SUB) private pubSub: PubSub,
  ) {}

  @Query(() => [NotificationModel])
  @UseGuards(GqlAuthGuard)
  async notifications(@GetCurrentUserId() userId: string) {
    return this.service.findByUser(userId);
  }

  @Query(() => Int)
  @UseGuards(GqlAuthGuard)
  async unreadNotificationsCount(@GetCurrentUserId() userId: string) {
    return this.service.unreadCount(userId);
  }

  @Mutation(() => NotificationModel)
  @UseGuards(GqlAuthGuard)
  async markNotificationRead(@Args('id') id: string) {
    return this.service.markAsRead(id);
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard)
  async markAllNotificationsRead(@GetCurrentUserId() userId: string) {
    return this.service.markAllAsRead(userId);
  }

  @Mutation(() => NotificationModel)
  @UseGuards(GqlAuthGuard)
  async deleteNotification(@Args('id') id: string) {
    return this.service.remove(id);
  }

  @Mutation(() => Int)
  @UseGuards(GqlAuthGuard)
  async deleteAllNotifications(@GetCurrentUserId() userId: string) {
    return this.service.removeAll(userId);
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard)
  async registerPushToken(
    @GetCurrentUserId() userId: string,
    @Args('token') token: string,
    @Args('platform', { nullable: true }) platform?: string,
  ) {
    await this.push.registerToken(userId, token, platform);
    return true;
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard)
  async removePushToken(@Args('token') token: string) {
    return this.push.removeToken(token);
  }

  /**
   * Real-time feed: clients receive each newly-created notification the instant
   * it's published. The per-user filter ensures a client only gets its own
   * notifications even though the trigger name is shared. Auth is enforced by
   * the WebSocket context (see `app.module.ts`); a connection without a valid
   * JWT never reaches here.
   */
  @Subscription(() => NotificationModel, {
    name: NOTIFICATION_CREATED,
    filter: (payload, _variables, ctx) =>
      payload[NOTIFICATION_CREATED].userId === ctx?.req?.user?.id,
  })
  @UseGuards(GqlAuthGuard)
  notificationCreated() {
    return this.pubSub.asyncIterableIterator(NOTIFICATION_CREATED);
  }
}
