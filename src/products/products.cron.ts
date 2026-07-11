import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ProductsService } from './products.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const PLAN_LABELS: Record<string, string> = {
  STAR: 'Estrella',
  PREMIUM: 'Premium',
};

@Injectable()
export class ProductsCron {
  private readonly logger = new Logger(ProductsCron.name);

  constructor(
    private products: ProductsService,
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleAutoBump() {
    const result = await this.products.autoBump();
    if (result.premiumBumped || result.starBumped) {
      this.logger.log(
        `Auto-bump: ${result.premiumBumped} PREMIUM, ${result.starBumped} STAR`,
      );
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handlePlanExpiry() {
    const now = new Date();
    const expired = await this.prisma.user.updateMany({
      where: {
        plan: { not: 'FREE' },
        planExpiresAt: { lt: now },
      },
      data: { plan: 'FREE' },
    });
    if (expired.count > 0) {
      this.logger.log(`Plan expiry: downgraded ${expired.count} users to FREE`);
    }
  }

  /**
   * Boost expiry notice: tells the seller their paid boost ended so they can
   * renew it. The 24h window (expired between yesterday's run and now) means
   * each product is notified exactly once.
   */
  @Cron(CronExpression.EVERY_DAY_AT_11AM)
  async handleBoostExpiry() {
    const now = new Date();
    const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const expired = await this.prisma.product.findMany({
      where: {
        status: 'active',
        boostedUntil: { gte: from, lt: now },
      },
      select: { id: true, title: true, sellerId: true },
    });

    for (const product of expired) {
      await this.notifications.create({
        userId: product.sellerId,
        type: 'system',
        title: 'Tu anuncio destacado terminó',
        body: `El destacado de "${product.title}" expiró. Renuévalo por WhatsApp para seguir apareciendo arriba.`,
        relatedProductId: product.id,
      });
    }

    if (expired.length > 0) {
      this.logger.log(`Boost expiry: notified ${expired.length} sellers`);
    }
  }

  /**
   * Renewal reminder: payment is manual (WhatsApp), so users need a heads-up
   * before the 3 AM downgrade hits them. The 24h window (day +2 → +3) means
   * each user is notified exactly once, three days before expiry.
   */
  @Cron(CronExpression.EVERY_DAY_AT_10AM)
  async handlePlanExpiryReminder() {
    const now = new Date();
    const from = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    const to = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const expiring = await this.prisma.user.findMany({
      where: {
        plan: { not: 'FREE' },
        planExpiresAt: { gte: from, lt: to },
      },
      select: { id: true, plan: true, planExpiresAt: true },
    });

    for (const user of expiring) {
      const label = PLAN_LABELS[user.plan] ?? user.plan;
      await this.notifications.create({
        userId: user.id,
        type: 'system',
        title: `Tu plan ${label} expira en 3 días`,
        body: `Renuévalo por WhatsApp para no perder tus ventajas: anuncios extra, insignia y visibilidad en portada.`,
        // Route hint: the mobile app opens the plans screen when a system
        // notification carries filterCat = 'plans'.
        filterCat: 'plans',
      });
    }

    if (expiring.length > 0) {
      this.logger.log(
        `Plan expiry reminder: notified ${expiring.length} users`,
      );
    }
  }
}
