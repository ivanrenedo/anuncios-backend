import { PrismaClient } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ProductsService } from '../../src/products/products.service';
import { AuditService } from '../../src/audit/audit.service';
import { StorageService } from '../../src/upload/storage.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { newTestPrisma, truncateAll } from './prisma-test.helper';
import { makeUser, makeCategory } from './factories';

/**
 * Walks a product through its whole public visibility life:
 *   create → shows up in search → admin hide → hidden from search →
 *   admin restore → back in search → seller delete → gone.
 * The three services are wired against a real Postgres, so this proves the
 * moderation flow the buyers see day-to-day is not silently broken.
 */
describe('Product lifecycle (integration)', () => {
  let prisma: PrismaClient;
  let service: ProductsService;
  let sellerId: string;
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
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    // PREMIUM to sidestep plan-limit branches — the lifecycle is what's
    // under test here, not the paywall.
    const seller = await makeUser(prisma, { plan: 'PREMIUM' });
    const category = await makeCategory(prisma, { label: 'Electronics' });
    sellerId = seller.id;
    categoryId = category.id;
  });

  it('runs the full lifecycle: create → hide → restore → delete', async () => {
    // 1. Seller publishes
    const created = await service.create(sellerId, {
      title: 'iPhone 15 Pro',
      description: 'unboxing sale',
      price: 800,
      categoryId,
    } as any);
    expect(created.status).toBe('active');

    // 2. Buyer searches → finds it
    const firstSearch = await service.search({ query: 'iphone' });
    expect(firstSearch.map((p) => p.id)).toEqual([created.id]);

    // 3. Admin hides it
    const hidden = await service.adminSetStatus(created.id, 'hide', 'looks dodgy', 'admin-x');
    expect(hidden.status).toBe('hide');

    // 4. Buyer searches → NOT visible
    const afterHide = await service.search({ query: 'iphone' });
    expect(afterHide).toEqual([]);

    // 5. Admin restores
    const restored = await service.adminSetStatus(created.id, 'active', undefined, 'admin-x');
    expect(restored.status).toBe('active');

    // 6. Buyer searches → back
    const afterRestore = await service.search({ query: 'iphone' });
    expect(afterRestore.map((p) => p.id)).toEqual([created.id]);

    // 7. Seller deletes
    await service.remove(created.id, sellerId);

    // 8. Buyer searches → gone
    const afterDelete = await service.search({ query: 'iphone' });
    expect(afterDelete).toEqual([]);
    const dbAfter = await prisma.product.findUnique({ where: { id: created.id } });
    expect(dbAfter).toBeNull();
  });

  it('hidden product is still findable by owner endpoint (search excludes only public views)', async () => {
    const p = await service.create(sellerId, {
      title: 'Sofa',
      price: 200,
      categoryId,
    } as any);
    await service.adminSetStatus(p.id, 'hide');

    // Owner-facing endpoint returns every status — search is the buyer view only.
    const mine = await service.findBySeller(sellerId);
    expect(mine.map((r) => r.id)).toContain(p.id);
    expect(mine.find((r) => r.id === p.id)?.status).toBe('hide');
  });

  it('adminSetStatus writes an admin_actions row for every moderation move', async () => {
    // admin_actions.admin_id has a real FK to users — pass an existing user
    // or the audit insert fails silently (fire-and-forget).
    const admin = await makeUser(prisma, { name: 'Mod' });
    const p = await service.create(sellerId, {
      title: 'Bike',
      price: 500,
      categoryId,
    } as any);

    await service.adminSetStatus(p.id, 'hide', 'stolen', admin.id);
    await service.adminSetStatus(p.id, 'active', undefined, admin.id);

    // audit.log is fire-and-forget — let the async inserts settle.
    await new Promise((r) => setTimeout(r, 50));

    const actions = await prisma.adminAction.findMany({
      where: { targetId: p.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(actions.map((a) => a.action)).toEqual(['hide_product', 'restore_product']);
    // Reason is used as detail for the hide (`hide_product`).
    expect(actions[0].detail).toBe('stolen');
    // For restore we passed no reason → falls back to the product title.
    expect(actions[1].detail).toBe('Bike');
  });

  it('emits ProductModerated on hide but NOT on restore', async () => {
    const events = (service as any).events as EventEmitter2;
    const spy = jest.fn();
    events.on('product.moderated', spy);

    const p = await service.create(sellerId, {
      title: 'Silla',
      price: 60,
      categoryId,
    } as any);

    await service.adminSetStatus(p.id, 'hide', 'bad photo');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toMatchObject({
      productId: p.id,
      productTitle: 'Silla',
      sellerId,
      reason: 'bad photo',
    });

    // Restore should not emit a moderation event.
    await service.adminSetStatus(p.id, 'active');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('remove by a non-owner throws ForbiddenException and leaves the product intact', async () => {
    const p = await service.create(sellerId, {
      title: 'Camera',
      price: 300,
      categoryId,
    } as any);
    const otherSeller = await makeUser(prisma, { plan: 'PREMIUM' });

    await expect(service.remove(p.id, otherSeller.id)).rejects.toThrow(
      'No tienes permiso',
    );

    const still = await prisma.product.findUnique({ where: { id: p.id } });
    expect(still).not.toBeNull();
    // Still findable in search — the failed delete should not have side-effects.
    const res = await service.search({ query: 'camera' });
    expect(res.map((r) => r.id)).toContain(p.id);
  });
});
