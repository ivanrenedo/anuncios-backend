import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

const RETENTION_DAYS = 30;
const FAIRNESS_WINDOW_DAYS = 7;
const CAROUSEL_SIZE = 3;

/**
 * Daily pick of the 3 products each Premium seller shows in the home
 * "Tiendas Premium" carousel. Runs at 00:00 GMT+1 (23:00 UTC on the day
 * before) so the frontend can render tomorrow's selection right at midnight
 * local time.
 *
 * Fairness rule: every active product a Premium seller has must appear at
 * least ~twice per rolling 7-day window. Implemented by sorting candidates by
 * appearance-count ascending over the last 7 days; ties broken by newest
 * first (favours freshly published stock). Sellers with fewer than 3 active
 * products get all they have.
 *
 * Idempotent: writing is keyed on (userId, day) so a manual re-run for the
 * same day is a no-op. Retention: rows older than 30 days are pruned at the
 * end of each run.
 */
@Injectable()
export class PremiumCarouselCron {
  private readonly logger = new Logger(PremiumCarouselCron.name);

  constructor(private prisma: PrismaService) {}

  // 23:00 UTC == 00:00 GMT+1 (Guinea Ecuatorial no observa DST).
  @Cron('0 23 * * *')
  async pickForToday() {
    const now = new Date();
    // "Tomorrow" from the server's perspective — the row we write here is the
    // carousel users will see starting at midnight local time.
    const targetDay = startOfUtcDay(new Date(now.getTime() + 60 * 60 * 1000));
    const result = await this.pickForDay(targetDay);
    this.logger.log(
      `Premium carousel for ${targetDay.toISOString().slice(0, 10)}: ` +
        `picked ${result.processedUsers}, skipped ${result.skippedUsers}, ` +
        `pruned ${result.prunedRows} old row(s)`,
    );
  }

  /**
   * Extracted from the cron handler so integration tests can drive it with a
   * frozen `day` and assert the resulting carousel selection.
   */
  async pickForDay(day: Date): Promise<{
    processedUsers: number;
    skippedUsers: number;
    prunedRows: number;
  }> {
    const dayKey = startOfUtcDay(day);

    const premiumUsers = await this.prisma.user.findMany({
      where: {
        plan: 'PREMIUM',
        suspended: false,
        OR: [{ planExpiresAt: null }, { planExpiresAt: { gt: day } }],
      },
      select: { id: true },
    });

    let processed = 0;
    let skipped = 0;

    for (const user of premiumUsers) {
      const existing = await this.prisma.premiumCarouselDay.findUnique({
        where: { userId_day: { userId: user.id, day: dayKey } },
      });
      if (existing) {
        skipped++;
        continue;
      }

      const activeProducts = await this.prisma.product.findMany({
        where: { sellerId: user.id, status: 'active' },
        select: { id: true, createdAt: true },
      });
      if (activeProducts.length === 0) {
        skipped++;
        continue;
      }

      const weekAgo = new Date(
        dayKey.getTime() - FAIRNESS_WINDOW_DAYS * 24 * 60 * 60 * 1000,
      );
      const history = await this.prisma.premiumCarouselDay.findMany({
        where: { userId: user.id, day: { gte: weekAgo, lt: dayKey } },
        select: { productIds: true },
      });

      const appearances = new Map<string, number>();
      for (const row of history) {
        for (const pid of row.productIds) {
          appearances.set(pid, (appearances.get(pid) ?? 0) + 1);
        }
      }

      const sorted = [...activeProducts].sort((a, b) => {
        const ca = appearances.get(a.id) ?? 0;
        const cb = appearances.get(b.id) ?? 0;
        if (ca !== cb) return ca - cb;
        return b.createdAt.getTime() - a.createdAt.getTime();
      });

      const picked = sorted.slice(0, CAROUSEL_SIZE).map((p) => p.id);

      await this.prisma.premiumCarouselDay.create({
        data: { userId: user.id, day: dayKey, productIds: picked },
      });
      processed++;
    }

    const retentionCutoff = new Date(
      dayKey.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    const pruned = await this.prisma.premiumCarouselDay.deleteMany({
      where: { day: { lt: retentionCutoff } },
    });

    return {
      processedUsers: processed,
      skippedUsers: skipped,
      prunedRows: pruned.count,
    };
  }
}

function startOfUtcDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}
