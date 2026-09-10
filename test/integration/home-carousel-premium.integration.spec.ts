import { PrismaClient } from '@prisma/client';
import { HomeSectionsService } from '../../src/home-sections/home-sections.service';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { newTestPrisma, truncateAll } from './prisma-test.helper';
import { makeUser, makeCategory, makeProduct } from './factories';

/**
 * `HomeSectionsService.premiumCarousel` returns today's `PremiumCarouselDay`
 * rows flattened round-robin. Two sellers with three products each render as
 * [S1P1, S2P1, S1P2, S2P2, S1P3, S2P3] so consecutive tiles are from
 * different vendors — the visual point of the carousel.
 *
 * Products whose status flipped to `hide` between the cron run and the query
 * are dropped from the output.
 */
describe('HomeSectionsService.premiumCarousel (integration)', () => {
  let prisma: PrismaClient;
  let service: HomeSectionsService;
  let categoryId: string;

  beforeAll(() => {
    prisma = newTestPrisma();
    service = new HomeSectionsService(
      prisma as unknown as PrismaService,
      {} as NotificationsService,
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    const cat = await makeCategory(prisma);
    categoryId = cat.id;
  });

  function startOfUtcDay(d = new Date()): Date {
    return new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
    );
  }

  it('returns [] when no PremiumCarouselDay exists for today', async () => {
    const result = await service.premiumCarousel();
    expect(result).toEqual([]);
  });

  it('interleaves two sellers × three products round-robin', async () => {
    const s1 = await makeUser(prisma, { plan: 'PREMIUM' });
    const s2 = await makeUser(prisma, { plan: 'PREMIUM' });
    const s1p = await Promise.all(
      Array.from({ length: 3 }).map(() =>
        makeProduct(prisma, { sellerId: s1.id, categoryId }),
      ),
    );
    const s2p = await Promise.all(
      Array.from({ length: 3 }).map(() =>
        makeProduct(prisma, { sellerId: s2.id, categoryId }),
      ),
    );

    const today = startOfUtcDay();
    await prisma.premiumCarouselDay.create({
      data: { userId: s1.id, day: today, productIds: s1p.map((p) => p.id) },
    });
    await prisma.premiumCarouselDay.create({
      data: { userId: s2.id, day: today, productIds: s2p.map((p) => p.id) },
    });

    const result = await service.premiumCarousel();
    const ids = result.map((p) => p.id);
    expect(ids).toEqual([
      s1p[0].id,
      s2p[0].id,
      s1p[1].id,
      s2p[1].id,
      s1p[2].id,
      s2p[2].id,
    ]);
  });

  it('drops products whose status flipped to hide between cron and query', async () => {
    const s1 = await makeUser(prisma, { plan: 'PREMIUM' });
    const active = await makeProduct(prisma, { sellerId: s1.id, categoryId });
    const hidden = await makeProduct(prisma, { sellerId: s1.id, categoryId });
    await prisma.product.update({
      where: { id: hidden.id },
      data: { status: 'hide' },
    });

    await prisma.premiumCarouselDay.create({
      data: {
        userId: s1.id,
        day: startOfUtcDay(),
        productIds: [active.id, hidden.id],
      },
    });

    const result = await service.premiumCarousel();
    expect(result.map((p) => p.id)).toEqual([active.id]);
  });

  it('ignores carousel rows from a different day (yesterday) — fallback recomputa hoy', async () => {
    // v2 Fase 11.5: la row de ayer no debe influir en el pick de hoy. Con el
    // fallback activo, hoy sin row se computa on-the-fly con los productos
    // activos del seller Premium.
    const s1 = await makeUser(prisma, {
      plan: 'PREMIUM',
      planExpiresAt: new Date('2099-01-01'),
    });
    const yesterdayProduct = await makeProduct(prisma, {
      sellerId: s1.id,
      categoryId,
      title: 'ayer',
    });
    const todayProduct = await makeProduct(prisma, {
      sellerId: s1.id,
      categoryId,
      title: 'hoy',
    });
    const yesterday = new Date(startOfUtcDay().getTime() - 24 * 60 * 60 * 1000);
    await prisma.premiumCarouselDay.create({
      data: {
        userId: s1.id,
        day: yesterday,
        productIds: [yesterdayProduct.id],
      },
    });

    const result = await service.premiumCarousel();
    // La row de ayer se ignora — hoy el fallback devuelve ambos productos
    // (los 2 activos del seller, ordenados por createdAt desc).
    expect(result.map((p) => p.id).sort()).toEqual(
      [yesterdayProduct.id, todayProduct.id].sort(),
    );
  });

  it('fallback: sin rows del cron, computa on-the-fly con cap 3 por vendedor (v2 Fase 11.5)', async () => {
    const s1 = await makeUser(prisma, {
      plan: 'PREMIUM',
      planExpiresAt: new Date('2099-01-01'),
    });
    // 5 productos activos — la fallback debe cortar a 3
    for (let i = 0; i < 5; i++) {
      await makeProduct(prisma, { sellerId: s1.id, categoryId });
    }
    // NO PremiumCarouselDay row: la query tiene que fallar limpiamente al
    // computar en línea.
    const result = await service.premiumCarousel();
    expect(result).toHaveLength(3);
    expect(result.every((p) => p.sellerId === s1.id)).toBe(true);
  });

  it('fallback: skips non-Premium y Premium expirados', async () => {
    const activePremium = await makeUser(prisma, {
      plan: 'PREMIUM',
      planExpiresAt: new Date('2099-01-01'),
    });
    const expiredPremium = await makeUser(prisma, {
      plan: 'PREMIUM',
      planExpiresAt: new Date('2000-01-01'),
    });
    const star = await makeUser(prisma, { plan: 'STAR' });
    for (const uid of [activePremium.id, expiredPremium.id, star.id]) {
      await makeProduct(prisma, { sellerId: uid, categoryId });
    }
    const result = await service.premiumCarousel();
    expect(result.map((p) => p.sellerId)).toEqual([activePremium.id]);
  });

  it('respects the take cap', async () => {
    const s1 = await makeUser(prisma, { plan: 'PREMIUM' });
    const products = await Promise.all(
      Array.from({ length: 3 }).map(() =>
        makeProduct(prisma, { sellerId: s1.id, categoryId }),
      ),
    );
    await prisma.premiumCarouselDay.create({
      data: {
        userId: s1.id,
        day: startOfUtcDay(),
        productIds: products.map((p) => p.id),
      },
    });

    const result = await service.premiumCarousel(2);
    expect(result).toHaveLength(2);
  });
});
