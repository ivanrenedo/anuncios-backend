import { PrismaClient } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ProductsService } from '../../src/products/products.service';
import { UsersService } from '../../src/users/users.service';
import { SellerQrScansService } from '../../src/seller-qr-scans/seller-qr-scans.service';
import { PlanPromoService } from '../../src/plan-promo/plan-promo.service';
import { AuditService } from '../../src/audit/audit.service';
import { StorageService } from '../../src/upload/storage.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PLAN_LIMITS } from '../../src/common/plan-limits';
import { UserPlan } from '../../src/users/dto/user-plan.enum';
import { newTestPrisma, truncateAll } from './prisma-test.helper';
import { makeUser, makeCategory, makeProduct } from './factories';

/**
 * The promotional period is the switch that makes every paid module free for a
 * while. It has to hold at the same places the paywall does — publishing,
 * fotos, fijados, auto-bump, boosts y estadísticas — because a seller who is
 * told "todo gratis" and then hits a 5-anuncio wall churns on the spot.
 *
 * Every test drives the real services through a real PlanPromoService, so a
 * regression in any single call site fails here.
 */
describe('Promotional period (integration)', () => {
  let prisma: PrismaClient;
  let promo: PlanPromoService;
  let products: ProductsService;
  let users: UsersService;
  let qrScans: SellerQrScansService;
  let categoryId: string;

  const storage = {
    deleteFile: jest.fn().mockResolvedValue(undefined),
    deleteFiles: jest.fn().mockResolvedValue(undefined),
  } as unknown as StorageService;

  beforeAll(() => {
    prisma = newTestPrisma();
    const audit = { log: jest.fn() } as unknown as AuditService;
    promo = new PlanPromoService(prisma as unknown as PrismaService, audit);
    products = new ProductsService(
      prisma as unknown as PrismaService,
      new EventEmitter2(),
      audit,
      storage,
      promo,
    );
    users = new UsersService(
      prisma as unknown as PrismaService,
      new EventEmitter2(),
      audit,
      storage,
      promo,
    );
    qrScans = new SellerQrScansService(
      prisma as unknown as PrismaService,
      promo,
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    jest.clearAllMocks();
    const category = await makeCategory(prisma, { label: 'Promo' });
    categoryId = category.id;
  });

  /** Flip the singleton straight through the service so its cache is dropped. */
  async function setPromo(input: Record<string, unknown>) {
    await promo.update('admin-test', input as never);
  }

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

  /** FREE seller: the tier that feels every gate. */
  async function freeSeller() {
    return makeUser(prisma, { plan: UserPlan.FREE, planExpiresAt: null });
  }

  describe('while the promo is off', () => {
    it('still blocks a FREE seller at the free quota', async () => {
      const seller = await freeSeller();
      await seedActive(seller.id, PLAN_LIMITS[UserPlan.FREE].maxActiveProducts);

      await expect(
        products.create(seller.id, {
          title: 'over-quota',
          price: 100,
          categoryId,
        } as never),
      ).rejects.toThrow(/máximo de \d+ anuncios/);
    });

    it('still refuses pinned products to a FREE seller', async () => {
      const seller = await freeSeller();
      const product = await makeProduct(prisma, {
        sellerId: seller.id,
        categoryId,
      });

      await expect(
        users.setPinnedProducts(seller.id, [product.id]),
      ).rejects.toThrow(/no permite anuncios fijados/);
    });
  });

  describe('while the promo grants Premium to everyone', () => {
    beforeEach(async () => {
      await setPromo({
        enabled: true,
        grantedPlan: UserPlan.PREMIUM,
        startsAt: null,
        endsAt: null,
        unlockLimits: true,
        unlockPinned: true,
        unlockAutoBump: true,
        unlockStats: true,
        freeBoosts: true,
      });
    });

    it('lets a FREE seller publish past the free quota', async () => {
      const seller = await freeSeller();
      await seedActive(seller.id, PLAN_LIMITS[UserPlan.FREE].maxActiveProducts);

      const created = await products.create(seller.id, {
        title: 'promo-listing',
        price: 100,
        categoryId,
      } as never);

      expect(created.id).toBeTruthy();
    });

    it('still stops a FREE seller at the granted plan ceiling', async () => {
      const seller = await freeSeller();
      await seedActive(
        seller.id,
        PLAN_LIMITS[UserPlan.PREMIUM].maxActiveProducts,
      );

      await expect(
        products.create(seller.id, {
          title: 'over-premium-quota',
          price: 100,
          categoryId,
        } as never),
      ).rejects.toThrow(/máximo de \d+ anuncios/);
    });

    it('opens pinned products to a FREE seller', async () => {
      const seller = await freeSeller();
      const product = await makeProduct(prisma, {
        sellerId: seller.id,
        categoryId,
        status: 'active',
      });

      const pinned = await users.setPinnedProducts(seller.id, [product.id]);

      expect(pinned).toHaveLength(1);
    });

    it('opens auto-bump to a FREE seller at the Premium cadence', async () => {
      const seller = await freeSeller();
      const product = await makeProduct(prisma, {
        sellerId: seller.id,
        categoryId,
        status: 'active',
      });

      const slots = await products.setAutoBumpSlots(seller.id, [product.id]);

      expect(slots).toHaveLength(1);
      expect(slots[0].cadence).toBe('DAILY');
    });

    it('makes a boost free and logs it as such in the ledger', async () => {
      const seller = await freeSeller();
      const product = await makeProduct(prisma, {
        sellerId: seller.id,
        categoryId,
        status: 'active',
      });

      await products.boostMyProduct(product.id, seller.id, 7);

      const [payment] = await prisma.payment.findMany({
        where: { userId: seller.id, concept: 'boost' },
      });
      expect(Number(payment.amount)).toBe(0);
      expect(payment.note).toContain('promo gratis');
    });

    it('tracks QR scans for a FREE seller', async () => {
      const seller = await freeSeller();

      const tracked = await qrScans.track({
        sellerId: seller.id,
        ip: '10.0.0.1',
        userAgent: 'jest',
      });

      expect(tracked).toBe(true);
    });

    it('leaves the stored plan untouched, so badges stay honest', async () => {
      const seller = await freeSeller();
      await products.create(seller.id, {
        title: 'promo-listing',
        price: 100,
        categoryId,
      } as never);

      const after = await prisma.user.findUnique({ where: { id: seller.id } });
      expect(after?.plan).toBe(UserPlan.FREE);
      expect(after?.planExpiresAt).toBeNull();
    });
  });

  describe('module switches', () => {
    it('unlocks limits without unlocking pinned products', async () => {
      await setPromo({
        enabled: true,
        grantedPlan: UserPlan.PREMIUM,
        startsAt: null,
        endsAt: null,
        unlockLimits: true,
        unlockPinned: false,
        unlockAutoBump: false,
        unlockStats: false,
        freeBoosts: false,
      });
      const seller = await freeSeller();
      await seedActive(seller.id, PLAN_LIMITS[UserPlan.FREE].maxActiveProducts);
      const product = await makeProduct(prisma, {
        sellerId: seller.id,
        categoryId,
        status: 'active',
      });

      await expect(
        products.create(seller.id, {
          title: 'allowed',
          price: 100,
          categoryId,
        } as never),
      ).resolves.toBeTruthy();
      await expect(
        users.setPinnedProducts(seller.id, [product.id]),
      ).rejects.toThrow(/no permite anuncios fijados/);
    });
  });

  describe('the promo window', () => {
    it('does not apply before it starts', async () => {
      await setPromo({
        enabled: true,
        grantedPlan: UserPlan.PREMIUM,
        startsAt: new Date(Date.now() + 86_400_000),
        endsAt: null,
      });
      const seller = await freeSeller();
      await seedActive(seller.id, PLAN_LIMITS[UserPlan.FREE].maxActiveProducts);

      await expect(
        products.create(seller.id, {
          title: 'too-early',
          price: 100,
          categoryId,
        } as never),
      ).rejects.toThrow(/máximo de \d+ anuncios/);
    });

    it('does not apply once it has ended', async () => {
      await setPromo({
        enabled: true,
        grantedPlan: UserPlan.PREMIUM,
        startsAt: new Date(Date.now() - 2 * 86_400_000),
        endsAt: new Date(Date.now() - 86_400_000),
      });
      const seller = await freeSeller();
      await seedActive(seller.id, PLAN_LIMITS[UserPlan.FREE].maxActiveProducts);

      await expect(
        products.create(seller.id, {
          title: 'too-late',
          price: 100,
          categoryId,
        } as never),
      ).rejects.toThrow(/máximo de \d+ anuncios/);
    });

    it('rejects a window that ends before it starts', async () => {
      await expect(
        setPromo({
          enabled: true,
          startsAt: new Date('2030-01-10'),
          endsAt: new Date('2030-01-01'),
        }),
      ).rejects.toThrow(/posterior a la de inicio/);
    });
  });

  describe('entitlements query', () => {
    it('reports the paid plan and the granted one separately', async () => {
      await setPromo({
        enabled: true,
        grantedPlan: UserPlan.PREMIUM,
        startsAt: null,
        endsAt: null,
        unlockLimits: true,
        unlockPinned: true,
        unlockAutoBump: true,
        unlockStats: true,
        freeBoosts: true,
      });
      const seller = await freeSeller();

      const ent = await promo.entitlementsFor(seller.id);

      expect(ent.plan).toBe(UserPlan.FREE);
      expect(ent.entitlementPlan).toBe(UserPlan.PREMIUM);
      expect(ent.promoActive).toBe(true);
      expect(ent.hasStats).toBe(true);
      expect(ent.freeBoosts).toBe(true);
      expect(ent.maxActiveProducts).toBe(
        PLAN_LIMITS[UserPlan.PREMIUM].maxActiveProducts,
      );
    });

    it('falls back to the paid plan with the promo off', async () => {
      await setPromo({ enabled: false });
      const seller = await freeSeller();

      const ent = await promo.entitlementsFor(seller.id);

      expect(ent.entitlementPlan).toBe(UserPlan.FREE);
      expect(ent.promoActive).toBe(false);
      expect(ent.maxActiveProducts).toBe(
        PLAN_LIMITS[UserPlan.FREE].maxActiveProducts,
      );
    });
  });
});
