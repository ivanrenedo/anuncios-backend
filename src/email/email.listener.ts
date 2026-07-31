import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EmailTemplate } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EMAIL_QUEUE, EmailJob } from './email.processor';
import { shouldSendEmail } from './preferences';
import {
  EmailEvents,
  PlanActivatedEvent,
  BoostReceiptEvent,
  VerificationApprovedEvent,
  VerificationRejectedEvent,
  AccountSuspendedEvent,
  UserRegisteredEvent,
} from './email.events';

const PLAN_LABELS: Record<string, string> = {
  STAR: 'Estrella',
  PREMIUM: 'Premium',
  FREE: 'Gratis',
};

const CONTACT_EMAIL_FALLBACK = 'digitalcorps365@gmail.com';

/**
 * Translates domain events into email jobs. Each handler resolves the
 * recipient's email + name, checks preferences, and enqueues one job with a
 * stable {@link EmailJob.dedupeKey}. All template-specific copy lives in the
 * templates themselves — this file only wires events → payloads.
 */
@Injectable()
export class EmailListener {
  private readonly logger = new Logger(EmailListener.name);

  constructor(
    private prisma: PrismaService,
    @InjectQueue(EMAIL_QUEUE) private queue: Queue<EmailJob>,
  ) {}

  @OnEvent(EmailEvents.PlanActivated, { async: true })
  async onPlanActivated(event: PlanActivatedEvent) {
    const user = await this.loadUser(event.userId);
    if (!user) return;
    if (!this.gate('plan_activated', user)) return;

    await this.enqueue({
      toEmail: user.email,
      userId: user.id,
      dedupeKey: `plan_activated:${user.id}:${event.planChangeId}`,
      payload: {
        template: 'plan_activated',
        data: {
          userName: user.name,
          planLabel: PLAN_LABELS[event.plan] ?? event.plan,
          amountXaf: event.amount,
          expiresAt: event.expiresAt,
          invoiceRef: event.planChangeId.slice(0, 8).toUpperCase(),
        },
      },
    });
  }

  @OnEvent(EmailEvents.BoostReceipt, { async: true })
  async onBoostReceipt(event: BoostReceiptEvent) {
    const user = await this.loadUser(event.userId);
    if (!user) return;
    if (!this.gate('boost_receipt', user)) return;

    await this.enqueue({
      toEmail: user.email,
      userId: user.id,
      dedupeKey: `boost_receipt:${event.productId}:${event.paymentId}`,
      payload: {
        template: 'boost_receipt',
        data: {
          userName: user.name,
          productTitle: event.productTitle,
          amountXaf: event.amount,
          boostedUntil: event.boostedUntil,
          invoiceRef: event.paymentId.slice(0, 8).toUpperCase(),
        },
      },
    });
  }

  @OnEvent(EmailEvents.VerificationApproved, { async: true })
  async onVerificationApproved(event: VerificationApprovedEvent) {
    const user = await this.loadUser(event.userId);
    if (!user) return;
    if (!this.gate('verification_approved', user)) return;

    await this.enqueue({
      toEmail: user.email,
      userId: user.id,
      dedupeKey: `verification_approved:${user.id}:${event.requestId}`,
      payload: {
        template: 'verification_approved',
        data: { userName: user.name },
      },
    });
  }

  @OnEvent(EmailEvents.VerificationRejected, { async: true })
  async onVerificationRejected(event: VerificationRejectedEvent) {
    const user = await this.loadUser(event.userId);
    if (!user) return;
    if (!this.gate('verification_rejected', user)) return;

    await this.enqueue({
      toEmail: user.email,
      userId: user.id,
      dedupeKey: `verification_rejected:${user.id}:${event.requestId}`,
      payload: {
        template: 'verification_rejected',
        data: { userName: user.name, reason: event.reason },
      },
    });
  }

  @OnEvent(EmailEvents.UserRegistered, { async: true })
  async onUserRegistered(event: UserRegisteredEvent) {
    const user = await this.loadUser(event.userId);
    if (!user) return;
    if (!this.gate('welcome', user)) return;

    await this.enqueue({
      toEmail: user.email,
      userId: user.id,
      dedupeKey: `welcome:${user.id}`,
      payload: {
        template: 'welcome',
        data: { userName: user.name },
      },
    });
  }

  @OnEvent(EmailEvents.AccountSuspended, { async: true })
  async onAccountSuspended(event: AccountSuspendedEvent) {
    const user = await this.loadUser(event.userId);
    if (!user) return;
    if (!this.gate('account_suspended', user)) return;

    const contact = await this.businessEmail();

    await this.enqueue({
      toEmail: user.email,
      userId: user.id,
      dedupeKey: `account_suspended:${user.id}:${event.suspendedAt.toISOString()}`,
      payload: {
        template: 'account_suspended',
        data: {
          userName: user.name,
          reason: event.reason,
          contactEmail: contact,
        },
      },
    });
  }

  private async loadUser(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        notifOffers: true,
        notifMarketing: true,
      },
    });
  }

  private gate(
    template: EmailTemplate,
    prefs: { notifOffers: boolean; notifMarketing: boolean },
  ) {
    const ok = shouldSendEmail(template, prefs);
    if (!ok) {
      this.logger.log(`Skipped ${template} — user preferences opted out`);
    }
    return ok;
  }

  private async businessEmail(): Promise<string> {
    const biz = await this.prisma.user.findFirst({
      where: { isBusiness: true },
      select: { email: true },
    });
    return biz?.email?.trim() || CONTACT_EMAIL_FALLBACK;
  }

  private async enqueue(job: EmailJob) {
    await this.queue.add(job.payload.template, job, {
      jobId: job.dedupeKey?.replace(/:/g, '-'),
    });
  }
}
