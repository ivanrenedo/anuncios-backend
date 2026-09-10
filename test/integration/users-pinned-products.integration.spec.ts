import { PrismaClient } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UsersService } from '../../src/users/users.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { StorageService } from '../../src/upload/storage.service';
import { AuditService } from '../../src/audit/audit.service';
import { UserPlan } from '../../src/users/dto/user-plan.enum';
import { newTestPrisma, truncateAll, newTestPromo } from './prisma-test.helper';
import { makeUser, makeCategory, makeProduct } from './factories';

/**
 * `setPinnedProducts` is a plan-gated seller mutation:
 *   - Free / Basic → forbidden (limit 0)
 *   - Star         → up to 4
 *   - Premium      → up to 10
 * Every id must belong to the caller and be active. Passing an empty array
 * clears the pin list. The write is idempotent under the transaction — the
 * previous rows are dropped in the same tx that inserts the new ones.
 */
describe('UsersService.setPinnedProducts (integration)', () => {
  let prisma: PrismaClient;
  let service: UsersService;
  let sellerId: string;
  let categoryId: string;

  beforeAll(() => {
    prisma = newTestPrisma();
    service = new UsersService(
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

  it('Free plan is forbidden from pinning anything', async () => {
    await prisma.user.update({
      where: { id: sellerId },
      data: { plan: 'FREE' },
    });
    const p = await makeProduct(prisma, { sellerId, categoryId });
    await expect(service.setPinnedProducts(sellerId, [p.id])).rejects.toThrow(
      /no permite anuncios fijados/i,
    );
  });

  it('Basic plan is also forbidden', async () => {
    await prisma.user.update({
      where: { id: sellerId },
      data: { plan: 'BASIC' },
    });
    const p = await makeProduct(prisma, { sellerId, categoryId });
    await expect(service.setPinnedProducts(sellerId, [p.id])).rejects.toThrow(
      /no permite anuncios fijados/i,
    );
  });

  it('Star plan allows up to 4 pins in the exact order supplied', async () => {
    const products = await Promise.all(
      Array.from({ length: 4 }).map(() =>
        makeProduct(prisma, { sellerId, categoryId }),
      ),
    );
    const ids = products.map((p) => p.id);

    const result = await service.setPinnedProducts(sellerId, ids);
    expect(result).toHaveLength(4);
    expect(result.map((p) => p.id)).toEqual(ids);

    const rows = await prisma.pinnedProduct.findMany({
      where: { userId: sellerId },
      orderBy: { position: 'asc' },
    });
    expect(rows.map((r) => ({ pid: r.productId, pos: r.position }))).toEqual([
      { pid: ids[0], pos: 0 },
      { pid: ids[1], pos: 1 },
      { pid: ids[2], pos: 2 },
      { pid: ids[3], pos: 3 },
    ]);
  });

  it('Star plan rejects a 5th pin (limit 4)', async () => {
    const products = await Promise.all(
      Array.from({ length: 5 }).map(() =>
        makeProduct(prisma, { sellerId, categoryId }),
      ),
    );
    await expect(
      service.setPinnedProducts(
        sellerId,
        products.map((p) => p.id),
      ),
    ).rejects.toThrow(/hasta 4 anuncios fijados/i);
  });

  it('Premium plan lifts the limit to 10', async () => {
    await prisma.user.update({
      where: { id: sellerId },
      data: { plan: 'PREMIUM' },
    });
    const products = await Promise.all(
      Array.from({ length: 10 }).map(() =>
        makeProduct(prisma, { sellerId, categoryId }),
      ),
    );
    const result = await service.setPinnedProducts(
      sellerId,
      products.map((p) => p.id),
    );
    expect(result).toHaveLength(10);
  });

  it('rejects a product that belongs to a different seller', async () => {
    const other = await makeUser(prisma);
    const strangerProduct = await makeProduct(prisma, {
      sellerId: other.id,
      categoryId,
    });
    await expect(
      service.setPinnedProducts(sellerId, [strangerProduct.id]),
    ).rejects.toThrow(/tuyos y estar activos/i);
  });

  it('rejects a hidden product', async () => {
    const hidden = await makeProduct(prisma, {
      sellerId,
      categoryId,
      status: 'hide',
    });
    await expect(
      service.setPinnedProducts(sellerId, [hidden.id]),
    ).rejects.toThrow(/tuyos y estar activos/i);
  });

  it('rejects duplicate ids in the input', async () => {
    const p = await makeProduct(prisma, { sellerId, categoryId });
    await expect(
      service.setPinnedProducts(sellerId, [p.id, p.id]),
    ).rejects.toThrow(/no pueden repetirse/i);
  });

  it('replaces the previous pin list on re-write (idempotent)', async () => {
    const [p1, p2, p3] = await Promise.all(
      Array.from({ length: 3 }).map(() =>
        makeProduct(prisma, { sellerId, categoryId }),
      ),
    );
    await service.setPinnedProducts(sellerId, [p1.id, p2.id]);
    await service.setPinnedProducts(sellerId, [p3.id]);

    const rows = await prisma.pinnedProduct.findMany({
      where: { userId: sellerId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].productId).toBe(p3.id);
    expect(rows[0].position).toBe(0);
  });

  it('empty array clears all pins', async () => {
    const p = await makeProduct(prisma, { sellerId, categoryId });
    await service.setPinnedProducts(sellerId, [p.id]);
    const result = await service.setPinnedProducts(sellerId, []);
    expect(result).toHaveLength(0);
    const count = await prisma.pinnedProduct.count({
      where: { userId: sellerId },
    });
    expect(count).toBe(0);
  });
});
