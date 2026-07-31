import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EmailService } from './email.service';
import { EmailListener } from './email.listener';
import { EmailProcessor, EMAIL_QUEUE } from './email.processor';
import {
  EmailUnsubscribeController,
  UnsubscribeTokenService,
} from './email.controller';
import { EmailCron } from './email.cron';

/**
 * Same shape as the notifications queue: bounded retries with exponential
 * backoff so transient SMTP hiccups recover, but a genuinely broken job
 * (permanent bounce, malformed template) gives up after 3 attempts and lands
 * in `failed` for inspection instead of retrying forever.
 */
const QUEUE = BullModule.registerQueue({
  name: EMAIL_QUEUE,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 },
  },
});

@Module({
  imports: [QUEUE],
  controllers: [EmailUnsubscribeController],
  providers: [
    EmailService,
    EmailListener,
    EmailProcessor,
    EmailCron,
    UnsubscribeTokenService,
  ],
  exports: [EmailService],
})
export class EmailModule {}
