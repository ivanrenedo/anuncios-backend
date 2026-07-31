import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { EMAIL_QUEUE, EmailJob } from './email.processor';
import { UnsubscribeTokenService } from './email.controller';

const PLAN_LABELS: Record<string, string> = {
  STAR: 'Estrella',
  PREMIUM: 'Premium',
  FREE: 'Gratis',
};

const COMEBACK_INACTIVE_DAYS = 60;
const PLAN_EXPIRING_WARN_DAYS = 7;
const CONTACT_WHATSAPP_FALLBACK = '240222626418';

/**
 * Scheduled email jobs. Every handler is idempotent thanks to the dedupe key
 * in {@link EmailJob} — running the same cron twice on the same day is a
 * no-op after the first pass, so manual re-runs are safe.
 *
 * Timing choices:
 *  - Plan lifecycle runs early morning (users see the email before opening
 *    the app). Two separate crons an hour apart so `plan_expiring` and
 *    `plan_expired` never race for the same user on the day of expiry.
 *  - Activity digest fires Monday morning covering the previous week.
 *  - Admin summary fires slightly earlier so admins see it before users start
 *    replying to their own weekly digest.
 */
@Injectable()
export class EmailCron {
  private readonly logger = new Logger(EmailCron.name);

  constructor(
    private prisma: PrismaService,
    private tokens: UnsubscribeTokenService,
    @InjectQueue(EMAIL_QUEUE) private queue: Queue<EmailJob>,
  ) {}

  // ── Daily: plan expiring (T-7 days) ─────────────────────────────────
  @Cron('0 8 * * *')
  async planExpiring() {
    const now = new Date();
    const in7 = new Date(now.getTime() + PLAN_EXPIRING_WARN_DAYS * 86_400_000);
    const users = await this.prisma.user.findMany({
      where: {
        plan: { in: ['STAR', 'PREMIUM'] },
        planExpiresAt: { gte: now, lte: in7 },
        suspended: false,
      },
      select: {
        id: true,
        name: true,
        email: true,
        plan: true,
        planExpiresAt: true,
      },
    });

    this.logger.log(`planExpiring cron: ${users.length} user(s) in window`);
    const contact = await this.businessWhatsapp();

    for (const u of users) {
      if (!u.planExpiresAt) continue;
      const daysLeft = Math.max(
        1,
        Math.ceil((u.planExpiresAt.getTime() - now.getTime()) / 86_400_000),
      );
      await this.enqueue({
        toEmail: u.email,
        userId: u.id,
        dedupeKey: `plan_expiring:${u.id}:${u.planExpiresAt.toISOString()}`,
        payload: {
          template: 'plan_expiring',
          data: {
            userName: u.name,
            planLabel: PLAN_LABELS[u.plan] ?? u.plan,
            daysLeft,
            expiresAt: u.planExpiresAt,
            contactWhatsapp: contact,
          },
        },
      });
    }
  }

  // ── Daily: plan expired (yesterday's window) ────────────────────────
  @Cron('0 9 * * *')
  async planExpired() {
    const now = new Date();
    const start = new Date(now.getTime() - 86_400_000);
    const users = await this.prisma.user.findMany({
      where: {
        plan: { in: ['STAR', 'PREMIUM'] },
        planExpiresAt: { gte: start, lte: now },
      },
      select: {
        id: true,
        name: true,
        email: true,
        plan: true,
        planExpiresAt: true,
      },
    });

    this.logger.log(`planExpired cron: ${users.length} user(s) in window`);
    const contact = await this.businessWhatsapp();

    for (const u of users) {
      if (!u.planExpiresAt) continue;
      await this.enqueue({
        toEmail: u.email,
        userId: u.id,
        dedupeKey: `plan_expired:${u.id}:${u.planExpiresAt.toISOString()}`,
        payload: {
          template: 'plan_expired',
          data: {
            userName: u.name,
            planLabel: PLAN_LABELS[u.plan] ?? u.plan,
            contactWhatsapp: contact,
          },
        },
      });
    }
  }

  // ── Daily: comeback (users inactive for 60+ days) ───────────────────
  @Cron('0 10 * * *')
  async comeback() {
    const now = new Date();
    const cutoff = new Date(
      now.getTime() - COMEBACK_INACTIVE_DAYS * 86_400_000,
    );
    const users = await this.prisma.user.findMany({
      where: {
        lastSeenAt: { lt: cutoff, not: null },
        suspended: false,
        notifMarketing: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        lastSeenAt: true,
      },
    });

    // Count fresh products globally as a proxy for "what happened while you
    // were away". Cheap query and same value for every recipient in this run.
    const newProductsCount = await this.prisma.product.count({
      where: {
        createdAt: { gte: cutoff },
        status: 'active',
      },
    });

    this.logger.log(`comeback cron: ${users.length} inactive user(s)`);
    const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

    for (const u of users) {
      if (!u.lastSeenAt) continue;
      const daysSinceLastSeen = Math.floor(
        (now.getTime() - u.lastSeenAt.getTime()) / 86_400_000,
      );
      await this.enqueue({
        toEmail: u.email,
        userId: u.id,
        // At most one comeback email per user per calendar month.
        dedupeKey: `comeback:${u.id}:${monthKey}`,
        payload: {
          template: 'comeback',
          data: {
            userName: u.name,
            daysSinceLastSeen,
            newProductsCount,
            unsubscribeUrl: this.tokens.urlFor(u.id, 'notifMarketing'),
          },
        },
      });
    }
  }

  // ── Weekly Monday 09:00: activity digest ────────────────────────────
  @Cron('0 9 * * 1')
  async activityDigest() {
    const now = new Date();
    const weekStart = new Date(now.getTime() - 7 * 86_400_000);

    // Aggregate favorites/followers/reviews received in the last week,
    // grouped by seller. `contactsReceived` isn't tracked per-event in
    // the schema (only an all-time counter on Product) so we surface 0
    // for now — the field survives in the template for when we do add
    // per-event tracking.
    const [favs, followers, reviews] = await Promise.all([
      this.prisma.favorite.findMany({
        where: { createdAt: { gte: weekStart } },
        select: { product: { select: { sellerId: true } } },
      }),
      this.prisma.follower.findMany({
        where: { createdAt: { gte: weekStart } },
        select: { followedId: true },
      }),
      this.prisma.review.findMany({
        where: { createdAt: { gte: weekStart } },
        select: { sellerId: true },
      }),
    ]);

    const bucket = new Map<
      string,
      { favs: number; followers: number; reviews: number }
    >();
    for (const f of favs) {
      const id = f.product?.sellerId;
      if (!id) continue;
      const row = bucket.get(id) ?? { favs: 0, followers: 0, reviews: 0 };
      row.favs += 1;
      bucket.set(id, row);
    }
    for (const f of followers) {
      const row = bucket.get(f.followedId) ?? {
        favs: 0,
        followers: 0,
        reviews: 0,
      };
      row.followers += 1;
      bucket.set(f.followedId, row);
    }
    for (const r of reviews) {
      const row = bucket.get(r.sellerId) ?? {
        favs: 0,
        followers: 0,
        reviews: 0,
      };
      row.reviews += 1;
      bucket.set(r.sellerId, row);
    }

    if (bucket.size === 0) {
      this.logger.log('activityDigest cron: no activity this week');
      return;
    }

    const users = await this.prisma.user.findMany({
      where: {
        id: { in: Array.from(bucket.keys()) },
        notifOffers: true,
        suspended: false,
      },
      select: { id: true, name: true, email: true },
    });

    const weekLabel = fmtDateRange(weekStart, now);
    const isoWeek = isoWeekKey(now);

    for (const u of users) {
      const stats = bucket.get(u.id)!;
      await this.enqueue({
        toEmail: u.email,
        userId: u.id,
        dedupeKey: `activity_digest:${u.id}:${isoWeek}`,
        payload: {
          template: 'activity_digest',
          data: {
            userName: u.name,
            favoritesReceived: stats.favs,
            contactsReceived: 0,
            newFollowers: stats.followers,
            reviewsReceived: stats.reviews,
            weekLabel,
            unsubscribeUrl: this.tokens.urlFor(u.id, 'notifOffers'),
          },
        },
      });
    }
  }

  // ── Weekly Monday 08:00: admin summary ──────────────────────────────
  @Cron('0 8 * * 1')
  async adminWeeklySummary() {
    const now = new Date();
    const weekStart = new Date(now.getTime() - 7 * 86_400_000);

    const [
      pendingReports,
      pendingVerifications,
      newUsersThisWeek,
      paidPlanChanges,
      admins,
    ] = await Promise.all([
      this.prisma.report.count({ where: { status: 'pending' } }),
      this.prisma.verificationRequest.count({ where: { status: 'pending' } }),
      this.prisma.user.count({ where: { createdAt: { gte: weekStart } } }),
      this.prisma.planChange.findMany({
        where: {
          createdAt: { gte: weekStart },
          newPlan: { in: ['STAR', 'PREMIUM'] },
        },
        select: { newPlan: true },
      }),
      this.prisma.user.findMany({
        where: {
          permission: 'GRANTED',
          suspended: false,
          rolId: { not: null },
        },
        select: { id: true, name: true, email: true },
      }),
    ]);

    // Estimate revenue from PlanChange rows this week. Prices live in
    // common/plan-limits (PLAN_PRICES) — importing here keeps the cron
    // decoupled from Payment table joins.
    const { PLAN_PRICES } = await import('../common/plan-limits');
    const revenueXaf = paidPlanChanges.reduce(
      (sum, pc) => sum + Number(PLAN_PRICES[pc.newPlan] ?? 0),
      0,
    );

    this.logger.log(
      `adminWeeklySummary cron: ${admins.length} admin(s), ${pendingReports} pending report(s)`,
    );
    const weekLabel = fmtDateRange(weekStart, now);
    const isoWeek = isoWeekKey(now);

    for (const a of admins) {
      await this.enqueue({
        toEmail: a.email,
        userId: a.id,
        dedupeKey: `admin_weekly_summary:${a.id}:${isoWeek}`,
        payload: {
          template: 'admin_weekly_summary',
          data: {
            adminName: a.name,
            pendingReports,
            pendingVerifications,
            newUsersThisWeek,
            paidPlansThisWeek: paidPlanChanges.length,
            revenueXaf,
            weekLabel,
          },
        },
      });
    }
  }

  private async businessWhatsapp(): Promise<string> {
    const biz = await this.prisma.user.findFirst({
      where: { isBusiness: true },
      select: { phone: true },
    });
    return biz?.phone?.trim() || CONTACT_WHATSAPP_FALLBACK;
  }

  private async enqueue(job: EmailJob) {
    await this.queue.add(job.payload.template, job, {
      jobId: job.dedupeKey?.replace(/:/g, '-'),
    });
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function fmtDateRange(start: Date, end: Date): string {
  const s = start.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
  });
  const e = end.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  return `${s} – ${e}`;
}

/** Stable ISO week key like "2026-W31" — used to dedupe weekly digests so
 *  a manual re-run on the same week is a no-op. */
function isoWeekKey(d: Date): string {
  const target = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return `${target.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}
