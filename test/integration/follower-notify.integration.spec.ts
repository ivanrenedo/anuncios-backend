import { PrismaClient } from '@prisma/client';
import { FollowerNotifyCron } from '../../src/notifications/follower-notify.cron';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { newTestPrisma, truncateAll } from './prisma-test.helper';
import { makeUser, makeCategory, makeProduct } from './factories';

/**
 * The batcher's contract:
 *   - never fire more than once per seller per 6h
 *   - aggregate every "new since last batch" product into one notification
 *   - on the very first pass for a seller, cap the lookback at 24h so we do
 *     not blast followers with the seller's back-catalogue at v2 launch
 *   - retention 30d for the audit rows
 */
describe('FollowerNotifyCron.flushAt (integration)', () => {
  let prisma: PrismaClient;
  let cron: FollowerNotifyCron;
  let sellerId: string;
  let followerId: string;
  let categoryId: string;

  // Minimal NotificationsService stub — writes straight to `notification` so
  // tests can inspect what would have been delivered without pulling in the
  // full preference / push stack.
  function makeStubNotifications(): NotificationsService {
    return {
      create: async (data: any) =>
        prisma.notification.create({
          data: { ...data, type: data.type },
        }),
    } as unknown as NotificationsService;
  }

  beforeAll(() => {
    prisma = newTestPrisma();
    cron = new FollowerNotifyCron(
      prisma as unknown as PrismaService,
      makeStubNotifications(),
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    const seller = await makeUser(prisma, { name: 'Juan' });
    const follower = await makeUser(prisma);
    const cat = await makeCategory(prisma);
    sellerId = seller.id;
    followerId = follower.id;
    categoryId = cat.id;
    await prisma.follower.create({
      data: { followerId: follower.id, followedId: seller.id },
    });
  });

  it('seller with no followers: never touched even with fresh products', async () => {
    await prisma.follower.deleteMany({});
    await makeProduct(prisma, { sellerId, categoryId });
    const now = new Date();
    const result = await cron.flushAt(now);
    expect(result.processedSellers).toBe(0);
    const batches = await prisma.followerNotifyBatch.findMany();
    expect(batches).toHaveLength(0);
  });

  it('1 fresh product → 1 notification per follower, singular copy', async () => {
    const product = await makeProduct(prisma, {
      sellerId,
      categoryId,
      title: 'iPhone 12 usado',
    });
    // Move createdAt within the 24h window (past 1h).
    const now = new Date();
    await prisma.product.update({
      where: { id: product.id },
      data: { createdAt: new Date(now.getTime() - 60 * 60 * 1000) },
    });

    const result = await cron.flushAt(now);
    expect(result.processedSellers).toBe(1);
    expect(result.notifiedFollowers).toBe(1);

    const [notif] = await prisma.notification.findMany({ where: { userId: followerId } });
    expect(notif.title).toBe('Nueva publicación de un vendedor que sigues');
    expect(notif.body).toBe('Juan publicó "iPhone 12 usado".');

    const [batch] = await prisma.followerNotifyBatch.findMany();
    expect(batch.productIds).toEqual([product.id]);
  });

  it('3 fresh products → 1 aggregated notification with "y 2 anuncios más"', async () => {
    const now = new Date();
    const p1 = await makeProduct(prisma, { sellerId, categoryId, title: 'iPhone 12' });
    const p2 = await makeProduct(prisma, { sellerId, categoryId, title: 'Cargador' });
    const p3 = await makeProduct(prisma, { sellerId, categoryId, title: 'Funda' });
    for (const p of [p1, p2, p3]) {
      await prisma.product.update({
        where: { id: p.id },
        data: { createdAt: new Date(now.getTime() - 60 * 60 * 1000) },
      });
    }

    await cron.flushAt(now);

    const notifs = await prisma.notification.findMany({ where: { userId: followerId } });
    expect(notifs).toHaveLength(1);
    expect(notifs[0].body).toMatch(/y 2 anuncios más\.$/);
  });

  it('5 fresh products → aggregated body "5 anuncios nuevos"', async () => {
    const now = new Date();
    for (let i = 0; i < 5; i++) {
      const p = await makeProduct(prisma, { sellerId, categoryId });
      await prisma.product.update({
        where: { id: p.id },
        data: { createdAt: new Date(now.getTime() - 60 * 60 * 1000) },
      });
    }

    await cron.flushAt(now);
    const [notif] = await prisma.notification.findMany({ where: { userId: followerId } });
    expect(notif.body).toBe('Juan publicó 5 anuncios nuevos.');
  });

  it('recent batch <6h ago: skipped (no dupe notification)', async () => {
    const now = new Date();
    await prisma.followerNotifyBatch.create({
      data: {
        userId: sellerId,
        batchedAt: new Date(now.getTime() - 60 * 60 * 1000),
        productIds: [],
      },
    });
    const p = await makeProduct(prisma, { sellerId, categoryId });
    await prisma.product.update({
      where: { id: p.id },
      data: { createdAt: new Date(now.getTime() - 30 * 60 * 1000) },
    });

    const result = await cron.flushAt(now);
    expect(result.processedSellers).toBe(0);
    const notifs = await prisma.notification.findMany({ where: { userId: followerId } });
    expect(notifs).toHaveLength(0);
  });

  it('previous batch >6h ago + new product: fires a fresh notification', async () => {
    const now = new Date();
    await prisma.followerNotifyBatch.create({
      data: {
        userId: sellerId,
        batchedAt: new Date(now.getTime() - 7 * 60 * 60 * 1000),
        productIds: [],
      },
    });
    const p = await makeProduct(prisma, { sellerId, categoryId });
    await prisma.product.update({
      where: { id: p.id },
      data: { createdAt: new Date(now.getTime() - 60 * 60 * 1000) },
    });

    const result = await cron.flushAt(now);
    expect(result.processedSellers).toBe(1);
    const notifs = await prisma.notification.findMany({ where: { userId: followerId } });
    expect(notifs).toHaveLength(1);
  });

  it('first-pass floor caps at 24h: an old product from 3 days ago is ignored', async () => {
    const now = new Date();
    const stale = await makeProduct(prisma, { sellerId, categoryId });
    await prisma.product.update({
      where: { id: stale.id },
      data: { createdAt: new Date(now.getTime() - 72 * 60 * 60 * 1000) },
    });

    const result = await cron.flushAt(now);
    expect(result.processedSellers).toBe(0);
    const notifs = await prisma.notification.findMany({ where: { userId: followerId } });
    expect(notifs).toHaveLength(0);
    // No batch was persisted either — first pass with no eligible products is
    // a full no-op so the very first eligible product later still fires.
    const batches = await prisma.followerNotifyBatch.findMany();
    expect(batches).toHaveLength(0);
  });

  it('prunes batch rows older than 30 days at the end of every run', async () => {
    const now = new Date();
    await prisma.followerNotifyBatch.create({
      data: {
        userId: sellerId,
        batchedAt: new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000),
        productIds: [],
      },
    });
    const result = await cron.flushAt(now);
    expect(result.prunedRows).toBe(1);
  });
});
