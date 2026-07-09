import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PushService } from './push.service';

/** Payload for a single push-delivery job. */
export interface DeliveryJobData {
  userId: string;
  notificationId: string;
  type: string;
  title: string;
  body?: string;
  relatedProductId?: string;
  relatedUserId?: string;
  sectionId?: string;
  filterCat?: string;
}

/**
 * Consumes the `notifications-delivery` queue and performs the actual Expo
 * push. Offloaded from the request path so a slow/failed push never blocks
 * the operation that triggered it. BullMQ retries on failure per the queue's
 * `defaultJobOptions`.
 */
@Processor('notifications-delivery', { concurrency: 3 })
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(private push: PushService) {
    super();
  }

  async process(job: Job<DeliveryJobData>): Promise<void> {
    const {
      userId, type, title, body, notificationId,
      relatedProductId, relatedUserId, sectionId, filterCat,
    } = job.data;
    await this.push.sendToUser(userId, {
      title,
      body,
      data: {
        notificationId, type,
        ...(relatedProductId && { productId: relatedProductId }),
        ...(relatedUserId && { userId: relatedUserId }),
        ...(sectionId && { sectionId }),
        ...(filterCat && { filterCat }),
      },
    });
  }
}
