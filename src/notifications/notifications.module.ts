import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationsService } from './notifications.service';
import { NotificationsResolver } from './notifications.resolver';
import { NotificationsAdminResolver } from './notifications.admin.resolver';
import { PushService } from './push.service';
import { NotificationsProcessor } from './notifications.processor';
import { NotificationsListener } from './notifications.listener';
import { pubSubProvider } from './providers/pubsub.provider';

/**
 * The delivery queue decouples Expo pushes from the request that triggered the
 * notification. Exponential backoff so transient Expo/Redis hiccups recover
 * without manual intervention.
 */
const NOTIFICATIONS_QUEUE = BullModule.registerQueue({
  name: 'notifications-delivery',
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 },
  },
});

@Module({
  imports: [NOTIFICATIONS_QUEUE],
  providers: [
    NotificationsService,
    NotificationsResolver,
    NotificationsAdminResolver,
    PushService,
    NotificationsProcessor,
    NotificationsListener,
    pubSubProvider,
  ],
  exports: [NotificationsService, PushService],
})
export class NotificationsModule {}
