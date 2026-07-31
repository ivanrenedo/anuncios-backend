import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EmailService, EmailPayload } from './email.service';

export interface EmailJob {
  toEmail: string;
  userId?: string | null;
  payload: EmailPayload;
  dedupeKey?: string;
}

export const EMAIL_QUEUE = 'emails-delivery';

/**
 * Drains the emails queue by calling {@link EmailService.send}. Retries
 * (attempts:3, exponential backoff) happen automatically at the queue level;
 * each retry hits `dedupeKey` so a job that already sent doesn't send again.
 */
@Processor(EMAIL_QUEUE)
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(private emailService: EmailService) {
    super();
  }

  async process(job: Job<EmailJob>) {
    const { toEmail, userId, payload, dedupeKey } = job.data;
    try {
      await this.emailService.send({ toEmail, userId, payload, dedupeKey });
    } catch (err: any) {
      this.logger.error(
        `Email job ${job.id} (${payload.template}) failed: ${err?.message}`,
      );
      throw err;
    }
  }
}
