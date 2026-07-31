import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import * as React from 'react';
import { render } from '@react-email/render';
import { EmailStatus, EmailTemplate, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

import { PinCodeEmail, pinCodeSubject } from './templates/pin-code';
import {
  PlanActivatedEmail,
  planActivatedSubject,
} from './templates/plan-activated';
import {
  BoostReceiptEmail,
  boostReceiptSubject,
} from './templates/boost-receipt';
import {
  VerificationApprovedEmail,
  verificationApprovedSubject,
} from './templates/verification-approved';
import {
  VerificationRejectedEmail,
  verificationRejectedSubject,
} from './templates/verification-rejected';
import {
  AccountSuspendedEmail,
  accountSuspendedSubject,
} from './templates/account-suspended';
import { WelcomeEmail, welcomeSubject } from './templates/welcome';
import {
  PlanExpiringEmail,
  planExpiringSubject,
} from './templates/plan-expiring';
import { PlanExpiredEmail, planExpiredSubject } from './templates/plan-expired';
import {
  ActivityDigestEmail,
  activityDigestSubject,
} from './templates/activity-digest';
import { ComebackEmail, comebackSubject } from './templates/comeback';
import {
  AdminWeeklySummaryEmail,
  adminWeeklySummarySubject,
} from './templates/admin-weekly-summary';

/**
 * Discriminated union of the payload accepted by {@link EmailService.send}.
 * The `template` picks the branch — TypeScript enforces the matching `data`
 * shape at the call site, so a caller can't ask for `pin_code` and pass
 * `boost_receipt` data.
 */
export type EmailPayload =
  | {
      template: 'pin_code';
      data: { code: string; expiresInMinutes: number };
    }
  | {
      template: 'plan_activated';
      data: {
        userName: string;
        planLabel: string;
        amountXaf: number;
        expiresAt: Date | null;
        invoiceRef: string;
      };
    }
  | {
      template: 'boost_receipt';
      data: {
        userName: string;
        productTitle: string;
        amountXaf: number;
        boostedUntil: Date;
        invoiceRef: string;
      };
    }
  | {
      template: 'verification_approved';
      data: { userName: string };
    }
  | {
      template: 'verification_rejected';
      data: { userName: string; reason?: string };
    }
  | {
      template: 'account_suspended';
      data: { userName: string; reason?: string; contactEmail: string };
    }
  | {
      template: 'welcome';
      data: { userName: string };
    }
  | {
      template: 'plan_expiring';
      data: {
        userName: string;
        planLabel: string;
        daysLeft: number;
        expiresAt: Date;
        contactWhatsapp: string;
      };
    }
  | {
      template: 'plan_expired';
      data: {
        userName: string;
        planLabel: string;
        contactWhatsapp: string;
      };
    }
  | {
      template: 'activity_digest';
      data: {
        userName: string;
        favoritesReceived: number;
        contactsReceived: number;
        newFollowers: number;
        reviewsReceived: number;
        weekLabel: string;
        unsubscribeUrl?: string;
      };
    }
  | {
      template: 'comeback';
      data: {
        userName: string;
        daysSinceLastSeen: number;
        newProductsCount: number;
        unsubscribeUrl?: string;
      };
    }
  | {
      template: 'admin_weekly_summary';
      data: {
        adminName: string;
        pendingReports: number;
        pendingVerifications: number;
        newUsersThisWeek: number;
        paidPlansThisWeek: number;
        revenueXaf: number;
        weekLabel: string;
      };
    };

interface SendOptions {
  toEmail: string;
  userId?: string | null;
  payload: EmailPayload;
  /** Natural key that de-duplicates sends across event retries. When set and
   *  a row with the same key already exists, the send is skipped. */
  dedupeKey?: string;
}

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private from: string;
  private readonly logger = new Logger(EmailService.name);

  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    const user = config.get<string>('SMTP_USER');
    const pass = config.get<string>('SMTP_PASS');
    this.from = user || '';

    if (user && pass) {
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
          user,
          pass,
        },
      });
    }
  }

  /**
   * Renders the template, records an {@link EmailLog} row and hands the
   * message off to nodemailer. Returns the log id (or `null` when the send
   * was deduped). Safe to await inline — callers that don't want to block
   * on SMTP should enqueue instead of calling this directly.
   */
  async send({
    toEmail,
    userId,
    payload,
    dedupeKey,
  }: SendOptions): Promise<string | null> {
    if (dedupeKey) {
      const existing = await this.prisma.emailLog.findUnique({
        where: { dedupeKey },
        select: { id: true },
      });
      if (existing) {
        this.logger.log(`Skipped duplicate send (dedupeKey=${dedupeKey})`);
        return null;
      }
    }

    const { subject, html } = await this.renderPayload(payload);
    const templateEnum = payload.template as EmailTemplate;

    let log;
    try {
      log = await this.prisma.emailLog.create({
        data: {
          userId: userId ?? null,
          toEmail,
          template: templateEnum,
          subject,
          status: EmailStatus.queued,
          dedupeKey: dedupeKey ?? null,
        },
      });
    } catch (e) {
      // Unique constraint on dedupeKey → concurrent send won the race.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        this.logger.log(
          `Dedup race lost (dedupeKey=${dedupeKey}) — other worker sending`,
        );
        return null;
      }
      throw e;
    }

    if (!this.transporter) {
      // Dev fallback: no SMTP configured. Log preview and mark as sent so the
      // audit row still exists — matches OtpEmailService's dev behavior.
      this.logger.warn(`[DEV] Email a ${toEmail} (${subject}) — no SMTP`);
      await this.prisma.emailLog.update({
        where: { id: log.id },
        data: { status: EmailStatus.sent, sentAt: new Date() },
      });
      return log.id;
    }

    try {
      const info = await this.transporter.sendMail({
        from: `"Bomelh" <${this.from}>`,
        to: toEmail,
        subject,
        html,
      });
      await this.prisma.emailLog.update({
        where: { id: log.id },
        data: {
          status: EmailStatus.sent,
          providerMsgId: info.messageId ?? null,
          sentAt: new Date(),
        },
      });
      return log.id;
    } catch (err: any) {
      await this.prisma.emailLog.update({
        where: { id: log.id },
        data: {
          status: EmailStatus.failed,
          error: String(err?.message ?? err).slice(0, 500),
        },
      });
      throw err;
    }
  }

  private async renderPayload(
    payload: EmailPayload,
  ): Promise<{ subject: string; html: string }> {
    switch (payload.template) {
      case 'pin_code':
        return {
          subject: pinCodeSubject,
          html: await render(React.createElement(PinCodeEmail, payload.data)),
        };
      case 'plan_activated':
        return {
          subject: planActivatedSubject(payload.data.planLabel),
          html: await render(
            React.createElement(PlanActivatedEmail, payload.data),
          ),
        };
      case 'boost_receipt':
        return {
          subject: boostReceiptSubject,
          html: await render(
            React.createElement(BoostReceiptEmail, payload.data),
          ),
        };
      case 'verification_approved':
        return {
          subject: verificationApprovedSubject,
          html: await render(
            React.createElement(VerificationApprovedEmail, payload.data),
          ),
        };
      case 'verification_rejected':
        return {
          subject: verificationRejectedSubject,
          html: await render(
            React.createElement(VerificationRejectedEmail, payload.data),
          ),
        };
      case 'account_suspended':
        return {
          subject: accountSuspendedSubject,
          html: await render(
            React.createElement(AccountSuspendedEmail, payload.data),
          ),
        };
      case 'welcome':
        return {
          subject: welcomeSubject,
          html: await render(React.createElement(WelcomeEmail, payload.data)),
        };
      case 'plan_expiring':
        return {
          subject: planExpiringSubject(payload.data.planLabel),
          html: await render(
            React.createElement(PlanExpiringEmail, payload.data),
          ),
        };
      case 'plan_expired':
        return {
          subject: planExpiredSubject(payload.data.planLabel),
          html: await render(
            React.createElement(PlanExpiredEmail, payload.data),
          ),
        };
      case 'activity_digest':
        return {
          subject: activityDigestSubject,
          html: await render(
            React.createElement(ActivityDigestEmail, payload.data),
          ),
        };
      case 'comeback':
        return {
          subject: comebackSubject,
          html: await render(React.createElement(ComebackEmail, payload.data)),
        };
      case 'admin_weekly_summary':
        return {
          subject: adminWeeklySummarySubject,
          html: await render(
            React.createElement(AdminWeeklySummaryEmail, payload.data),
          ),
        };
    }
  }
}
