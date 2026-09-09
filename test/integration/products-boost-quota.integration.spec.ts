import { PrismaClient } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ProductsService } from '../../src/products/products.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { StorageService } from '../../src/upload/storage.service';
import { AuditService } from '../../src/audit/audit.service';
import { newTestPrisma, truncateAll, newTestPromo } from './prisma-test.helper';
import { makeUser, makeCategory, makeProduct } from './factories';

describe('ProductsService boost quotas (integration)', () => {
  let prisma: PrismaClient;
  let service: ProductsService;
  let sellerId: string;
  let categoryId: string;

  const audit = { log: jest.fn() } as unknown as AuditService;

  beforeAll(() => {
    prisma = newTestPrisma();
    service = new ProductsService(
      prisma as unknown as PrismaService,
      new EventEmitter2(),
      audit,
      {} as StorageService,
      newTestPromo(prisma),
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    jest.clearAllMocks();
    const seller = await makeUser(prisma, {
      plan: 'PREMIUM',
      planStartedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      planExpiresAt: new Date('2099-01-01'),
    });
    const cat = await makeCategory(prisma);
    sellerId = seller.id;
    categoryId = cat.id;
  });

  it('lets a Premium seller consume an included monthly boost', async () => {
    const product = await makeProduct(prisma, { sellerId, categoryId });

    const boosted = await service.boostMyProduct(product.id, sellerId, 7);

    expect(boosted.boostedUntil).toBeTruthy();
    const payment = await prisma.payment.findFirstOrThrow({
      where: { userId: sellerId, productId: product.id, concept: 'boost' },
    });
    expect(Number(payment.amount)).toBe(0);
    expect(payment.note).toContain('incluido 1/8');
  });

  it('blocks seller self-service once included boosts are used', async () => {
    const product = await makeProduct(prisma, { sellerId, categoryId });
    await seedBoostPayments(8);

    await expect(
      service.boostMyProduct(product.id, sellerId, 7),
    ).rejects.toThrow(/1000 XAF/i);
  });

  it('admin activation charges Premium extras at 50 percent off', async () => {
    const admin = await makeUser(prisma);
    const product = await makeProduct(prisma, { sellerId, categoryId });
    await seedBoostPayments(8);

    await service.boostProduct(product.id, 7, admin.id);

    const payment = await prisma.payment.findFirstOrThrow({
      where: { userId: sellerId, productId: product.id, concept: 'boost' },
      orderBy: { createdAt: 'desc' },
    });
    expect(Number(payment.amount)).toBe(1000);
    expect(payment.note).toContain('extra -50%');
  });

  it('extends an already active boost from its current end date', async () => {
    const product = await makeProduct(prisma, { sellerId, categoryId });
    const currentUntil = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    await prisma.product.update({
      where: { id: product.id },
      data: { boostedUntil: currentUntil },
    });

    const boosted = await service.boostMyProduct(product.id, sellerId, 3);

    expect(boosted.boostedUntil!.getTime()).toBeGreaterThan(
      currentUntil.getTime() + 2 * 24 * 60 * 60 * 1000,
    );
  });

  async function seedBoostPayments(count: number) {
    for (let i = 0; i < count; i++) {
      await prisma.payment.create({
        data: {
          userId: sellerId,
          amount: 0,
          concept: 'boost',
          note: `fixture ${i + 1}`,
        },
      });
    }
  }
});
