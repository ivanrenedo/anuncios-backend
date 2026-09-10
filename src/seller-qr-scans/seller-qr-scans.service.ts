import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { activePlan, hasStatsAccess } from '../common/plan-limits';
import { PlanPromoService } from '../plan-promo/plan-promo.service';

/** Two visits from the same visitor within this window count once. */
const DEDUP_WINDOW_MS = 30 * 60 * 1000;

/** Salt for visitor hashing. Falls back to a per-process value so the hash is
 *  still non-reversible if the env var isn't set — but the recommended prod
 *  setup is a stable QR_SCAN_SALT in `.env` so hashes survive restarts and
 *  dedup keeps working across pods. */
const SALT =
  process.env.QR_SCAN_SALT ||
  createHash('sha256').update(String(Math.random())).digest('hex');

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export interface TrackScanInput {
  sellerId: string;
  source?: string;
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class SellerQrScansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly promo: PlanPromoService,
  ) {}

  /**
   * Record a QR-driven visit to a seller's public profile. Silently no-ops
   * when the seller can't be found or their active plan isn't STAR/PREMIUM,
   * and dedupes repeat scans from the same visitor within 30 minutes. Returns
   * `true` when a row was written, `false` otherwise.
   */
  async track(input: TrackScanInput): Promise<boolean> {
    const seller = await this.prisma.user.findUnique({
      where: { id: input.sellerId },
      select: { id: true, plan: true, planExpiresAt: true },
    });
    if (!seller) return false;

    const plan = activePlan({
      plan: seller.plan,
      planExpiresAt: seller.planExpiresAt,
    });
    // Stats are a paid module, so the promo can open them to every seller.
    if (!hasStatsAccess(plan, await this.promo.state())) return false;

    const ipHash = input.ip ? sha256(`${input.ip}|${SALT}`) : null;
    const visitorHash =
      input.ip || input.userAgent
        ? sha256(`${input.ip ?? ''}|${input.userAgent ?? ''}|${SALT}`)
        : null;

    if (visitorHash) {
      const cutoff = new Date(Date.now() - DEDUP_WINDOW_MS);
      const recent = await this.prisma.sellerQrScan.findFirst({
        where: {
          sellerId: seller.id,
          visitorHash,
          createdAt: { gte: cutoff },
        },
        select: { id: true },
      });
      if (recent) return false;
    }

    await this.prisma.sellerQrScan.create({
      data: {
        sellerId: seller.id,
        source: input.source?.slice(0, 20) || 'qr',
        visitorHash,
        ipHash,
        userAgent: input.userAgent?.slice(0, 300) ?? null,
      },
    });
    return true;
  }

  /**
   * Aggregate stats for the caller's own QR scans. All buckets are computed
   * from the same table so the numbers can't drift.
   */
  async myStats(userId: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const start30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [total, thisMonth, last30Days, lastRow] = await Promise.all([
      this.prisma.sellerQrScan.count({ where: { sellerId: userId } }),
      this.prisma.sellerQrScan.count({
        where: { sellerId: userId, createdAt: { gte: startOfMonth } },
      }),
      this.prisma.sellerQrScan.count({
        where: { sellerId: userId, createdAt: { gte: start30 } },
      }),
      this.prisma.sellerQrScan.findFirst({
        where: { sellerId: userId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);

    return {
      total,
      thisMonth,
      last30Days,
      lastScanAt: lastRow?.createdAt ?? null,
    };
  }
}
