import { PrismaClient } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ProductsService } from '../../src/products/products.service';
import { AuditService } from '../../src/audit/audit.service';
import { StorageService } from '../../src/upload/storage.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PLAN_LIMITS } from '../../src/common/plan-limits';
import { UserPlan } from '../../src/users/dto/user-plan.enum';
import { newTestPrisma, truncateAll, newTestPromo } from './prisma-test.helper';
import { makeUser, makeCategory, makeProduct } from './factories';

/**
 * Guards the paywall around active-product publishing. Each paid plan enforces
 * its own quota, and downgrades (auto-expiry) fall back to the FREE cap even
 * though the seller may already sit above it — the pre-existing anuncios stay
 * visible, but new ones must be blocked until the seller trims down.
 */
describe('Plan quota enforcement (integration)', () => {
  let prisma: PrismaClient;
  let service: ProductsService;
  let categoryId: string;

  beforeAll(() => {
    prisma = newTestPrisma();
    service = new ProductsService(
      prisma as unknown as PrismaService,
      new EventEmitter2(),
      new AuditService(prisma as unknown as PrismaService),
      {
        deleteFile: jest.fn().mockResolvedValue(undefined),
        deleteFiles: jest.fn().mockResolvedValue(undefined),
      } as unknown as StorageService,
      newTestPromo(prisma),
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    const category = await makeCategory(prisma, { label: 'Test' });
    categoryId = category.id;
  });

  // Seed the seller with `count` active anuncios so we can push right up
  // against the plan quota in a single line at the top of each test.
  async function seedActive(sellerId: string, count: number) {
    for (let i = 0; i < count; i++) {
      await makeProduct(prisma, {
        sellerId,
        categoryId,
        title: `seed-${i}`,
        status: 'active',
      });
    }
  }

  // BASIC as the exemplar for the "paid plan" branch — it's the tier the DB
  // was missing entirely before this change. Includes the two boundary cases
  // the ternary in products.service.create hangs on (`==` vs `>=`) plus the
  // "under quota" pass to make sure a real seller isn't collateral-blocked.
  describe.each([
    {
      plan: UserPlan.FREE,
      limit: PLAN_LIMITS[UserPlan.FREE].maxActiveProducts,
    },
    {
      plan: UserPlan.BASIC,
      limit: PLAN_LIMITS[UserPlan.BASIC].maxActiveProducts,
    },
    {
      plan: UserPlan.STAR,
      limit: PLAN_LIMITS[UserPlan.STAR].maxActiveProducts,
    },
  ])('$plan (limit=$limit)', ({ plan, limit }) => {
    it(`blocks create when activeCount == limit`, async () => {
      const seller = await makeUser(prisma, {
        plan,
        // Non-null so activePlan() does not virtual-downgrade the paid plans.
        planExpiresAt:
          plan === UserPlan.FREE ? null : new Date(Date.now() + 86_400_000),
      });
      await seedActive(seller.id, limit);

      await expect(
        service.create(seller.id, {
          title: 'over-quota',
          price: 100,
          categoryId,
        } as any),
      ).rejects.toThrow(/máximo de \d+ anuncios/);
    });

    it(`allows create when activeCount == limit - 1`, async () => {
      const seller = await makeUser(prisma, {
        plan,
        planExpiresAt:
          plan === UserPlan.FREE ? null : new Date(Date.now() + 86_400_000),
      });
      await seedActive(seller.id, limit - 1);

      const created = await service.create(seller.id, {
        title: 'last-slot',
        price: 100,
        categoryId,
      } as any);
      expect(created.status).toBe('active');
    });
  });

  it('PREMIUM cap is high enough to swallow a burst of real-world publishing', async () => {
    const seller = await makeUser(prisma, {
      plan: UserPlan.PREMIUM,
      planExpiresAt: new Date(Date.now() + 86_400_000),
    });
    // Push right up against the documented PREMIUM ceiling. The 101st write
    // is what actually verifies the cap fires — if it silently passed, the
    // UI promise of "hasta 100" would be a lie the seller only spots after
    // sinking money in.
    await seedActive(
      seller.id,
      PLAN_LIMITS[UserPlan.PREMIUM].maxActiveProducts,
    );
    await expect(
      service.create(seller.id, {
        title: 'over-premium',
        price: 100,
        categoryId,
      } as any),
    ).rejects.toThrow(/máximo/);
  });

  it('blocks reactivating a hidden anuncio when the seller is at quota', async () => {
    // Reactivate uses the same counter as create; without this test, an
    // owner could bypass the cap by hide/publish-new/unhide cycling.
    const seller = await makeUser(prisma, { plan: UserPlan.FREE });
    const freeLimit = PLAN_LIMITS[UserPlan.FREE].maxActiveProducts;
    await seedActive(seller.id, freeLimit);
    const hidden = await makeProduct(prisma, {
      sellerId: seller.id,
      categoryId,
      title: 'sleeping',
      status: 'hide',
    });

    await expect(
      service.update(hidden.id, seller.id, { status: 'active' } as any),
    ).rejects.toThrow(/máximo de \d+ anuncios/);

    // And unchanged in DB — no partial write.
    const after = await prisma.product.findUnique({ where: { id: hidden.id } });
    expect(after?.status).toBe('hide');
  });

  it('expired paid plan blocks NEW anuncios but leaves the existing ones live', async () => {
    // The scenario a real seller hits: pays for BASIC (15), fills 8 slots,
    // subscription lapses. FREE only allows 5, so we must reject the 9th
    // but MUST NOT retro-hide the 8 already published — pulling anuncios
    // out from under a paying customer is worse than the over-quota state.
    const seller = await makeUser(prisma, {
      plan: UserPlan.BASIC,
      planExpiresAt: new Date('2020-01-01'), // expired → activePlan() = FREE
    });
    await seedActive(seller.id, 8);

    await expect(
      service.create(seller.id, {
        title: 'post-downgrade',
        price: 100,
        categoryId,
      } as any),
    ).rejects.toThrow(/plan FREE/);

    const still = await prisma.product.count({
      where: { sellerId: seller.id, status: 'active' },
    });
    expect(still).toBe(8);
  });
});
