import { PrismaClient } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UsersService } from '../../src/users/users.service';
import { AuditService } from '../../src/audit/audit.service';
import { StorageService } from '../../src/upload/storage.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { HomeSectionsService } from '../../src/home-sections/home-sections.service';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { PremiumCarouselCron } from '../../src/home-sections/premium-carousel.cron';
import { FollowerNotifyCron } from '../../src/notifications/follower-notify.cron';
import { UserPlan } from '../../src/users/dto/user-plan.enum';
import { newTestPrisma, truncateAll } from './prisma-test.helper';
import { makeUser, makeCategory, makeProduct } from './factories';

/**
 * v2 Fase 9.1 — End-to-end integration walking every layer we shipped:
 *
 *   admin activates PREMIUM 6m for a seller
 *     ↓ (users.service.activatePlan)
 *   user.plan flips to PREMIUM and the daily cron considers them
 *     ↓ (premium-carousel.cron.pickForDay)
 *   PremiumCarouselDay row exists for today, with the seller's products
 *     ↓ (home-sections.service.premiumCarousel)
 *   /homeCarouselPremium query returns the seller's products
 *     ↓ (follower-notify.cron.flushAt)
 *   Followers of that seller get one aggregated notification
 *
 * Any layer regressing here means a shopper on Home would not see the just-
 * activated Premium seller's products. Fast to run, cheap to keep green.
 */
describe('plans-v2 end-to-end (integration)', () => {
  let prisma: PrismaClient;
  let users: UsersService;
  let sections: HomeSectionsService;
  let carouselCron: PremiumCarouselCron;
  let followerCron: FollowerNotifyCron;

  beforeAll(() => {
    prisma = newTestPrisma();
    const events = new EventEmitter2();
    const audit = new AuditService(prisma as unknown as PrismaService);
    users = new UsersService(
      prisma as unknown as PrismaService,
      events,
      audit,
      {} as StorageService,
    );
    // NotificationsService stub — writes straight to `notification` so the E2E
    // asserts what would have been delivered without pulling in the full
    // preference / push stack.
    const notifications = {
      create: async (data: any) =>
        prisma.notification.create({ data: { ...data, type: data.type } }),
    } as unknown as NotificationsService;
    sections = new HomeSectionsService(
      prisma as unknown as PrismaService,
      notifications,
    );
    carouselCron = new PremiumCarouselCron(prisma as unknown as PrismaService);
    followerCron = new FollowerNotifyCron(
      prisma as unknown as PrismaService,
      notifications,
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  it('admin activates PREMIUM 6m → cron picks products → carousel exposes them → followers get one aggregated notif', async () => {
    // Setup: an admin, a soon-to-be-Premium seller with an active listing,
    // and a follower who cares about that seller.
    const admin = await makeUser(prisma);
    const seller = await makeUser(prisma, { plan: 'FREE', name: 'Ada' });
    const follower = await makeUser(prisma);
    const cat = await makeCategory(prisma);

    const product = await makeProduct(prisma, {
      sellerId: seller.id,
      categoryId: cat.id,
      title: 'Portátil ProBook 15',
    });
    // Fresh enough to fall inside the follower-notify 24h first-pass floor.
    const now = new Date();
    await prisma.product.update({
      where: { id: product.id },
      data: { createdAt: new Date(now.getTime() - 60 * 60 * 1000) },
    });
    await prisma.follower.create({
      data: { followerId: follower.id, followedId: seller.id },
    });

    // 1. Admin activates PREMIUM × 6 months.
    const activation = await users.activatePlan(admin.id, {
      userId: seller.id,
      plan: UserPlan.PREMIUM,
      months: 6,
    });
    expect(Number(activation.totalPaid)).toBe(189_000); // Premium 6m con -10%
    const updated = await prisma.user.findUnique({ where: { id: seller.id } });
    expect(updated!.plan).toBe('PREMIUM');
    expect(updated!.planExpiresAt!.getTime()).toBeGreaterThan(Date.now());

    // 2. Daily carousel cron for today — should now pick this seller.
    const day = new Date();
    const cronResult = await carouselCron.pickForDay(day);
    expect(cronResult.processedUsers).toBe(1);

    // 3. Home carousel query returns the seller's product on today's rail.
    const carousel = await sections.premiumCarousel();
    expect(carousel.map((p) => p.id)).toContain(product.id);
    expect(carousel[0].seller?.id).toBe(seller.id);

    // 4. Follower-notify cron: seller has 1 fresh product + 1 follower →
    //    exactly one aggregated notification is created, one batch row logged.
    const followerResult = await followerCron.flushAt(now);
    expect(followerResult.processedSellers).toBe(1);
    expect(followerResult.notifiedFollowers).toBe(1);

    const notifs = await prisma.notification.findMany({
      where: { userId: follower.id, type: 'follow' },
    });
    expect(notifs).toHaveLength(1);
    expect(notifs[0].body).toContain('Ada');
    expect(notifs[0].body).toContain('Portátil ProBook 15');
    expect(notifs[0].relatedProductId).toBe(product.id);
    expect(notifs[0].relatedUserId).toBe(seller.id);

    // 5. And a follower-notify batch row was persisted for audit / rate-limit.
    const batches = await prisma.followerNotifyBatch.findMany({
      where: { userId: seller.id },
    });
    expect(batches).toHaveLength(1);
    expect(batches[0].productIds).toEqual([product.id]);
  });

  it('11-month cliff: activating 11m costs strictly more than 12m for every paid plan', async () => {
    // Documented in docs/plans-v2-decisions.md — the admin UI shows a warning
    // when the current selection is more expensive than the yearly. This test
    // pins the arithmetic invariant so anyone who re-tunes DISCOUNT_TIERS
    // learns immediately that the cliff still exists.
    const admin = await makeUser(prisma);
    const priceAt = async (plan: UserPlan, months: number) => {
      const seller = await makeUser(prisma, { plan: 'FREE' });
      const act = await users.activatePlan(admin.id, {
        userId: seller.id,
        plan,
        months,
      });
      return Number(act.totalPaid);
    };
    for (const plan of [UserPlan.BASIC, UserPlan.STAR, UserPlan.PREMIUM]) {
      const eleven = await priceAt(plan, 11);
      const twelve = await priceAt(plan, 12);
      expect(twelve).toBeLessThan(eleven);
    }
  });
});
