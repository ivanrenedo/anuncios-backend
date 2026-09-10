import { PrismaClient, Prisma } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ProductsService } from '../../src/products/products.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { StorageService } from '../../src/upload/storage.service';
import { AuditService } from '../../src/audit/audit.service';
import { newTestPrisma, truncateAll, newTestPromo } from './prisma-test.helper';
import { makeUser, makeCategory, makeProduct } from './factories';

/**
 * The v2 "Rebajado hoy" chip needs a 48h server-authoritative timestamp.
 * `updateProduct` sets `priceReducedUntil = now + 48h` whenever the effective
 * price drops (either by lowering `price` or by adding/raising `discount`).
 * A price increase or no-op update never stamps the field.
 */
describe('ProductsService.update priceReducedUntil hook (integration)', () => {
  let prisma: PrismaClient;
  let service: ProductsService;
  let sellerId: string;
  let categoryId: string;
  const HOUR = 60 * 60 * 1000;

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
    const seller = await makeUser(prisma, { plan: 'STAR' });
    const cat = await makeCategory(prisma);
    sellerId = seller.id;
    categoryId = cat.id;
  });

  it('lowering price stamps priceReducedUntil ~48h from now', async () => {
    const product = await makeProduct(prisma, {
      sellerId,
      categoryId,
      price: 100_000,
    });

    const before = Date.now();
    const updated = await service.update(product.id, sellerId, {
      price: 80_000,
    } as any);
    const after = Date.now();

    expect(updated!.priceReducedUntil).not.toBeNull();
    const stamped = updated!.priceReducedUntil!.getTime();
    expect(stamped).toBeGreaterThanOrEqual(before + 48 * HOUR - 5 * 1000);
    expect(stamped).toBeLessThanOrEqual(after + 48 * HOUR + 5 * 1000);
  });

  it('raising price does NOT stamp priceReducedUntil', async () => {
    const product = await makeProduct(prisma, {
      sellerId,
      categoryId,
      price: 100_000,
    });

    const updated = await service.update(product.id, sellerId, {
      price: 120_000,
    } as any);
    expect(updated!.priceReducedUntil).toBeNull();
  });

  it('same-price update does NOT stamp priceReducedUntil', async () => {
    const product = await makeProduct(prisma, {
      sellerId,
      categoryId,
      price: 100_000,
    });

    const updated = await service.update(product.id, sellerId, {
      price: 100_000,
    } as any);
    expect(updated!.priceReducedUntil).toBeNull();
  });

  it('adding a discount that drops the effective price also stamps it', async () => {
    const product = await makeProduct(prisma, {
      sellerId,
      categoryId,
      price: 100_000,
    });

    const updated = await service.update(product.id, sellerId, {
      discount: 20,
    } as any);

    expect(updated!.priceReducedUntil).not.toBeNull();
  });
});
