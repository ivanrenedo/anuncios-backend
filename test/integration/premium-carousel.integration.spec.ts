import { PrismaClient } from '@prisma/client';
import { PremiumCarouselCron } from '../../src/home-sections/premium-carousel.cron';
import { PrismaService } from '../../src/prisma/prisma.service';
import { newTestPrisma, truncateAll } from './prisma-test.helper';
import { makeUser, makeCategory, makeProduct } from './factories';

/**
 * Fairness invariant: over a rolling 7-day window, every active product a
 * Premium seller has should surface at least ~twice in the home carousel.
 * Implemented as: pick 3 products ordered by (appearances asc, createdAt desc)
 * for the last 7 days of `PremiumCarouselDay` rows.
 *
 * Also pinned: idempotency (same day = no dupe), plan gating (expired /
 * suspended don't run), and retention (>30d rows deleted).
 */
describe('PremiumCarouselCron.pickForDay (integration)', () => {
  let prisma: PrismaClient;
  let cron: PremiumCarouselCron;
  let sellerId: string;
  let categoryId: string;

  beforeAll(() => {
    prisma = newTestPrisma();
    cron = new PremiumCarouselCron(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    const seller = await makeUser(prisma, {
      plan: 'PREMIUM',
      planExpiresAt: new Date('2099-01-01'),
    });
    const cat = await makeCategory(prisma);
    sellerId = seller.id;
    categoryId = cat.id;
  });

  it('with 5 active products on day 1, picks 3 (newest first, no history)', async () => {
    const products = await Promise.all(
      Array.from({ length: 5 }).map(() =>
        makeProduct(prisma, { sellerId, categoryId }),
      ),
    );
    // Age them so createdAt tiebreak is deterministic — oldest first, newest last.
    for (let i = 0; i < products.length; i++) {
      await prisma.product.update({
        where: { id: products[i].id },
        data: { createdAt: new Date(2020, 0, 1 + i) },
      });
    }

    const day = new Date('2026-06-15T00:00:00Z');
    const result = await cron.pickForDay(day);
    expect(result.processedUsers).toBe(1);

    const row = await prisma.premiumCarouselDay.findFirst({
      where: { userId: sellerId },
    });
    expect(row).not.toBeNull();
    expect(row!.productIds).toHaveLength(3);
    // Newest 3 are the last three by createdAt.
    expect(row!.productIds).toEqual([
      products[4].id,
      products[3].id,
      products[2].id,
    ]);
  });

  it('with fewer than 3 active products, writes an array of exactly that length', async () => {
    const p1 = await makeProduct(prisma, { sellerId, categoryId });
    const p2 = await makeProduct(prisma, { sellerId, categoryId });

    const day = new Date('2026-06-15T00:00:00Z');
    await cron.pickForDay(day);

    const row = await prisma.premiumCarouselDay.findFirst({
      where: { userId: sellerId },
    });
    expect(row!.productIds).toHaveLength(2);
    expect(row!.productIds).toEqual(expect.arrayContaining([p1.id, p2.id]));
  });

  it('fairness: after 3 days of picking A/B/C, day 4 picks D/E ahead of the veterans', async () => {
    // 5 products with fixed createdAt so ties are deterministic.
    const products = await Promise.all(
      Array.from({ length: 5 }).map(() =>
        makeProduct(prisma, { sellerId, categoryId }),
      ),
    );
    for (let i = 0; i < products.length; i++) {
      await prisma.product.update({
        where: { id: products[i].id },
        data: { createdAt: new Date(2020, 0, 1 + i) },
      });
    }
    const [a, b, c, d, e] = products;

    // Prime 3 days of history with A/B/C picked every day.
    const day = new Date('2026-06-15T00:00:00Z');
    for (let daysAgo = 3; daysAgo >= 1; daysAgo--) {
      await prisma.premiumCarouselDay.create({
        data: {
          userId: sellerId,
          day: new Date(day.getTime() - daysAgo * 24 * 60 * 60 * 1000),
          productIds: [a.id, b.id, c.id],
        },
      });
    }

    await cron.pickForDay(day);

    const row = await prisma.premiumCarouselDay.findFirst({
      where: { userId: sellerId, day },
    });
    expect(row).not.toBeNull();
    // D and E have 0 appearances → picked first. The third slot is one of A/B/C
    // (3 appearances each — tie broken by newest createdAt, which is C).
    expect(row!.productIds).toEqual([e.id, d.id, c.id]);
  });

  it('idempotent for the same day (re-run does not duplicate)', async () => {
    await makeProduct(prisma, { sellerId, categoryId });
    const day = new Date('2026-06-15T00:00:00Z');
    await cron.pickForDay(day);
    const second = await cron.pickForDay(day);
    expect(second.skippedUsers).toBe(1);
    expect(second.processedUsers).toBe(0);

    const rows = await prisma.premiumCarouselDay.findMany({
      where: { userId: sellerId, day },
    });
    expect(rows).toHaveLength(1);
  });

  it('skips users whose plan is expired', async () => {
    await prisma.user.update({
      where: { id: sellerId },
      data: { planExpiresAt: new Date('2000-01-01') },
    });
    await makeProduct(prisma, { sellerId, categoryId });

    const result = await cron.pickForDay(new Date('2026-06-15T00:00:00Z'));
    expect(result.processedUsers).toBe(0);
    expect(result.skippedUsers).toBe(0);
  });

  it('skips users who are suspended', async () => {
    await prisma.user.update({
      where: { id: sellerId },
      data: { suspended: true },
    });
    await makeProduct(prisma, { sellerId, categoryId });

    const result = await cron.pickForDay(new Date('2026-06-15T00:00:00Z'));
    expect(result.processedUsers).toBe(0);
  });

  it('skips a Premium seller with zero active products', async () => {
    const result = await cron.pickForDay(new Date('2026-06-15T00:00:00Z'));
    expect(result.skippedUsers).toBe(1);
    expect(result.processedUsers).toBe(0);
  });

  it('prunes rows older than 30 days at the end of the run', async () => {
    await makeProduct(prisma, { sellerId, categoryId });
    const day = new Date('2026-06-15T00:00:00Z');
    const ancient = new Date(day.getTime() - 31 * 24 * 60 * 60 * 1000);
    await prisma.premiumCarouselDay.create({
      data: { userId: sellerId, day: ancient, productIds: [] },
    });

    const result = await cron.pickForDay(day);
    expect(result.prunedRows).toBe(1);

    const oldRow = await prisma.premiumCarouselDay.findFirst({
      where: { userId: sellerId, day: ancient },
    });
    expect(oldRow).toBeNull();
  });
});
