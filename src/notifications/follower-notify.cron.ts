import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

const BATCH_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000;
const FIRST_PASS_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const RETENTION_DAYS = 30;

/**
 * v2 (Fase 4.4). Groups "seller published a new product" events so a follower
 * never receives more than one aggregated notification per followed seller
 * per 6h. Runs every hour; the effective delivery latency is therefore in
 * [1h, 7h].
 *
 * Algorithm per seller:
 *   1. Look up the most recent `FollowerNotifyBatch.batchedAt` for this seller.
 *   2. If it's less than 6h ago, skip — a follower already got a batch recently.
 *   3. Cutoff = max(lastBatch?.batchedAt, now - 24h). On the very first pass
 *      for a seller with no batch history, we cap at 24h so we don't spam
 *      followers with the seller's entire back-catalogue at v2 launch.
 *   4. Products with createdAt > cutoff and status = active are the payload.
 *   5. If there are 1+ new products AND the seller has 1+ followers, insert
 *      one notification per follower with an aggregated body, then persist
 *      one FollowerNotifyBatch row.
 *
 * Retention: batch rows older than 30 days are deleted to keep the table
 * bounded (only the most recent per seller matters for gating).
 */
@Injectable()
export class FollowerNotifyCron {
  private readonly logger = new Logger(FollowerNotifyCron.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async flushBatches() {
    const result = await this.flushAt(new Date());
    if (result.notifiedFollowers > 0 || result.processedSellers > 0) {
      this.logger.log(
        `Follower notify batch: ${result.processedSellers} seller(s), ` +
          `${result.notifiedFollowers} follower(s) notified, ` +
          `pruned ${result.prunedRows} old batch row(s)`,
      );
    }
  }

  /**
   * Extracted for integration tests — accepts an explicit `now` so time
   * windows can be exercised deterministically.
   */
  async flushAt(now: Date): Promise<{
    processedSellers: number;
    notifiedFollowers: number;
    prunedRows: number;
  }> {
    // Sellers who actually have followers — the join here is worth it because
    // "seller with no followers" is the common case (99 % of accounts) and we
    // don't want to iterate them.
    const sellersWithFollowers = await this.prisma.follower.findMany({
      distinct: ['followedId'],
      select: {
        followedId: true,
        followed: {
          select: { id: true, name: true, avatarUrl: true },
        },
      },
    });

    let processed = 0;
    let notified = 0;

    for (const row of sellersWithFollowers) {
      const seller = row.followed;
      const lastBatch = await this.prisma.followerNotifyBatch.findFirst({
        where: { userId: seller.id },
        orderBy: { batchedAt: 'desc' },
        select: { batchedAt: true },
      });
      if (
        lastBatch &&
        now.getTime() - lastBatch.batchedAt.getTime() < BATCH_MIN_INTERVAL_MS
      ) {
        continue;
      }

      const firstPassFloor = new Date(now.getTime() - FIRST_PASS_LOOKBACK_MS);
      const cutoff = lastBatch
        ? new Date(
            Math.max(lastBatch.batchedAt.getTime(), firstPassFloor.getTime()),
          )
        : firstPassFloor;

      const newProducts = await this.prisma.product.findMany({
        where: {
          sellerId: seller.id,
          status: 'active',
          createdAt: { gt: cutoff },
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true },
      });
      if (newProducts.length === 0) continue;

      const followers = await this.prisma.follower.findMany({
        where: { followedId: seller.id },
        select: { followerId: true },
      });

      const body = buildAggregatedBody(seller.name, newProducts);
      const primaryProductId = newProducts[0].id;

      await Promise.all(
        followers.map((f) =>
          this.notifications.create({
            userId: f.followerId,
            type: 'follow',
            title:
              newProducts.length === 1
                ? 'Nueva publicación de un vendedor que sigues'
                : `Nuevas publicaciones de ${seller.name}`,
            body,
            avatar: seller.avatarUrl ?? undefined,
            relatedUserId: seller.id,
            relatedProductId: primaryProductId,
          }),
        ),
      );

      await this.prisma.followerNotifyBatch.create({
        data: {
          userId: seller.id,
          batchedAt: now,
          productIds: newProducts.map((p) => p.id),
        },
      });

      processed++;
      notified += followers.length;
    }

    const retentionCutoff = new Date(
      now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    const pruned = await this.prisma.followerNotifyBatch.deleteMany({
      where: { batchedAt: { lt: retentionCutoff } },
    });

    return {
      processedSellers: processed,
      notifiedFollowers: notified,
      prunedRows: pruned.count,
    };
  }
}

function buildAggregatedBody(
  sellerName: string,
  products: Array<{ title: string }>,
): string {
  if (products.length === 1) {
    return `${sellerName} publicó "${products[0].title}".`;
  }
  if (products.length === 2 || products.length === 3) {
    return (
      `${sellerName} publicó "${products[0].title}"` +
      ` y ${products.length - 1} anuncio${products.length === 2 ? '' : 's'} más.`
    );
  }
  return `${sellerName} publicó ${products.length} anuncios nuevos.`;
}
