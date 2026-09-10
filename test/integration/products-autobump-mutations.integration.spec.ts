import { PrismaClient } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ProductsService } from '../../src/products/products.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { StorageService } from '../../src/upload/storage.service';
import { AuditService } from '../../src/audit/audit.service';
import { newTestPrisma, truncateAll, newTestPromo } from './prisma-test.helper';
import { makeUser, makeCategory, makeProduct } from './factories';

/**
 * `setAutoBumpSlots` mirrors `setPinnedProducts` (Fase 5.1) but with a
 * plan-derived `cadence`:
 *   - Star    → WEEKLY, up to 3 slots
 *   - Premium → DAILY, up to 5 slots
 *   - Free / Basic → forbidden.
 * The seller never chooses the cadence — it is derived from their plan.
 */
describe('ProductsService.setAutoBumpSlots (integration)', () => {
  let prisma: PrismaClient;
  let service: ProductsService;
  let sellerId: string;
  let categoryId: string;

  beforeAll(() => {
    prisma = newTestPrisma();
    service = new ProductsService(
      prisma as unknown as PrismaService,
      new EventEmitter2(),
      {} as AuditService,
      {} as StorageService,
      newTestPromo(prisma),
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    const seller = await makeUser(prisma, {
      plan: 'STAR',
      planExpiresAt: new Date('2099-01-01'),
    });
    const cat = await makeCategory(prisma);
    sellerId = seller.id;
    categoryId = cat.id;
  });

  it('Free plan is forbidden', async () => {
    await prisma.user.update({
      where: { id: sellerId },
      data: { plan: 'FREE' },
    });
    const p = await makeProduct(prisma, { sellerId, categoryId });
    await expect(service.setAutoBumpSlots(sellerId, [p.id])).rejects.toThrow(
      /no incluye auto-bump/i,
    );
  });

  it('Basic plan is also forbidden', async () => {
    await prisma.user.update({
      where: { id: sellerId },
      data: { plan: 'BASIC' },
    });
    const p = await makeProduct(prisma, { sellerId, categoryId });
    await expect(service.setAutoBumpSlots(sellerId, [p.id])).rejects.toThrow(
      /no incluye auto-bump/i,
    );
  });

  it('Star: creates up to 3 WEEKLY slots', async () => {
    const products = await Promise.all(
      Array.from({ length: 3 }).map(() =>
        makeProduct(prisma, { sellerId, categoryId }),
      ),
    );
    const result = await service.setAutoBumpSlots(
      sellerId,
      products.map((p) => p.id),
    );
    expect(result).toHaveLength(3);
    const rows = await prisma.autoBumpSlot.findMany({
      where: { userId: sellerId },
    });
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.cadence === 'WEEKLY')).toBe(true);
  });

  it('Star rejects the 4th slot', async () => {
    const products = await Promise.all(
      Array.from({ length: 4 }).map(() =>
        makeProduct(prisma, { sellerId, categoryId }),
      ),
    );
    await expect(
      service.setAutoBumpSlots(
        sellerId,
        products.map((p) => p.id),
      ),
    ).rejects.toThrow(/hasta 3 anuncios/i);
  });

  it('Premium: creates DAILY slots up to 5', async () => {
    await prisma.user.update({
      where: { id: sellerId },
      data: { plan: 'PREMIUM' },
    });
    const products = await Promise.all(
      Array.from({ length: 5 }).map(() =>
        makeProduct(prisma, { sellerId, categoryId }),
      ),
    );
    const result = await service.setAutoBumpSlots(
      sellerId,
      products.map((p) => p.id),
    );
    expect(result).toHaveLength(5);
    const rows = await prisma.autoBumpSlot.findMany({
      where: { userId: sellerId },
    });
    expect(rows.every((r) => r.cadence === 'DAILY')).toBe(true);
  });

  it('rejects a product that belongs to a different seller', async () => {
    const stranger = await makeUser(prisma);
    const foreign = await makeProduct(prisma, {
      sellerId: stranger.id,
      categoryId,
    });
    await expect(
      service.setAutoBumpSlots(sellerId, [foreign.id]),
    ).rejects.toThrow(/tuyos y estar activos/i);
  });

  it('empty array clears the pool', async () => {
    const p = await makeProduct(prisma, { sellerId, categoryId });
    await service.setAutoBumpSlots(sellerId, [p.id]);
    const emptied = await service.setAutoBumpSlots(sellerId, []);
    expect(emptied).toHaveLength(0);
    const count = await prisma.autoBumpSlot.count({
      where: { userId: sellerId },
    });
    expect(count).toBe(0);
  });

  it('changing plan (Star → Premium) re-derives cadence on next write', async () => {
    const p = await makeProduct(prisma, { sellerId, categoryId });
    await service.setAutoBumpSlots(sellerId, [p.id]);
    const [starSlot] = await prisma.autoBumpSlot.findMany({
      where: { userId: sellerId },
    });
    expect(starSlot.cadence).toBe('WEEKLY');

    await prisma.user.update({
      where: { id: sellerId },
      data: { plan: 'PREMIUM' },
    });
    await service.setAutoBumpSlots(sellerId, [p.id]);
    const [premiumSlot] = await prisma.autoBumpSlot.findMany({
      where: { userId: sellerId },
    });
    expect(premiumSlot.cadence).toBe('DAILY');
  });
});
