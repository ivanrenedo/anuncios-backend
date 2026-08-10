import { PrismaClient } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ProductsService } from '../../src/products/products.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { StorageService } from '../../src/upload/storage.service';
import { AuditService } from '../../src/audit/audit.service';
import { newTestPrisma, truncateAll } from './prisma-test.helper';
import { makeUser, makeCategory, makeProduct } from './factories';

/**
 * v2 auto-bump only touches products a seller has explicitly added to their
 * `AutoBumpSlot` pool. Empty pool = no bump, even for Premium — this is a
 * deliberate change from v1's "bump everything Premium every 24h". Boosted
 * products bypass the pool because a paid boost is a hard commitment.
 */
describe('ProductsService.autoBump (v2 slot pool, integration)', () => {
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
    );
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

  it('Premium seller with no slots: NOTHING gets bumped even after 48h', async () => {
    const staleAt = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const product = await makeProduct(prisma, { sellerId, categoryId });
    await prisma.product.update({
      where: { id: product.id },
      data: { bumpedAt: staleAt },
    });

    const result = await service.autoBump();
    expect(result.premiumBumped).toBe(0);
    expect(result.starBumped).toBe(0);

    const after = await prisma.product.findUnique({ where: { id: product.id } });
    expect(after!.bumpedAt.getTime()).toBe(staleAt.getTime());
  });

  it('DAILY slot on a Premium seller: product bumped once past 24h cutoff', async () => {
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const product = await makeProduct(prisma, { sellerId, categoryId });
    await prisma.product.update({
      where: { id: product.id },
      data: { bumpedAt: twoDaysAgo },
    });
    await prisma.autoBumpSlot.create({
      data: { userId: sellerId, productId: product.id, cadence: 'DAILY' },
    });

    const result = await service.autoBump();
    expect(result.premiumBumped).toBe(1);

    const after = await prisma.product.findUnique({ where: { id: product.id } });
    expect(after!.bumpedAt.getTime()).toBeGreaterThan(twoDaysAgo.getTime());
  });

  it('Slotted product bumped less than 24h ago: NOT re-bumped', async () => {
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const product = await makeProduct(prisma, { sellerId, categoryId });
    await prisma.product.update({
      where: { id: product.id },
      data: { bumpedAt: hourAgo },
    });
    await prisma.autoBumpSlot.create({
      data: { userId: sellerId, productId: product.id, cadence: 'DAILY' },
    });

    const result = await service.autoBump();
    expect(result.premiumBumped).toBe(0);
  });

  it('WEEKLY slot: bumped past 7d cutoff (STAR seller — WEEKLY cadence)', async () => {
    // v2 Fase 12 — WEEKLY solo aplica a plan STAR. Cambiamos el fixture
    // Premium → STAR para reflejar el gate por plan añadido en el cron.
    await prisma.user.update({
      where: { id: sellerId },
      data: { plan: 'STAR' },
    });
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const product = await makeProduct(prisma, { sellerId, categoryId });
    await prisma.product.update({
      where: { id: product.id },
      data: { bumpedAt: eightDaysAgo },
    });
    await prisma.autoBumpSlot.create({
      data: { userId: sellerId, productId: product.id, cadence: 'WEEKLY' },
    });

    const result = await service.autoBump();
    expect(result.starBumped).toBe(1);
    expect(result.premiumBumped).toBe(0);
  });

  it('cross-cadence: WEEKLY slot en seller PREMIUM NO bumpea (plan gate)', async () => {
    // v2 Fase 12: si un vendedor era STAR (WEEKLY slots) y admin lo sube a
    // PREMIUM, sus slots WEEKLY quedan huérfanos hasta que re-guarde. El
    // cron no los bumpea con la cadencia vieja — protege contra plan drift.
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const product = await makeProduct(prisma, { sellerId, categoryId });
    await prisma.product.update({
      where: { id: product.id },
      data: { bumpedAt: eightDaysAgo },
    });
    await prisma.autoBumpSlot.create({
      data: { userId: sellerId, productId: product.id, cadence: 'WEEKLY' },
    });

    const result = await service.autoBump();
    expect(result.starBumped).toBe(0);
    expect(result.premiumBumped).toBe(0);
  });

  it('setAutoBumpSlots bumpea inmediatamente los productos NUEVOS del pool', async () => {
    // v2 Fase 12: el cron corre cada hora pero solo si bumpedAt > 24h.
    // Sin bump instantáneo al añadir al pool, el seller espera horas sin ver
    // el cambio. Este test pin el comportamiento nuevo.
    const oldBump = new Date(Date.now() - 30 * 60 * 1000); // 30 min ago
    const product = await makeProduct(prisma, { sellerId, categoryId });
    await prisma.product.update({
      where: { id: product.id },
      data: { bumpedAt: oldBump },
    });

    await service.setAutoBumpSlots(sellerId, [product.id]);

    const after = await prisma.product.findUnique({ where: { id: product.id } });
    expect(after!.bumpedAt.getTime()).toBeGreaterThan(oldBump.getTime());
  });

  it('setAutoBumpSlots re-save de mismos ids NO re-bumpea', async () => {
    // Diff logic: solo los NUEVOS ids reciben bump instantáneo.
    const product = await makeProduct(prisma, { sellerId, categoryId });
    // Primera pasada crea slot + bump instantáneo.
    await service.setAutoBumpSlots(sellerId, [product.id]);
    const firstBump = (await prisma.product.findUnique({ where: { id: product.id } }))!.bumpedAt;

    // Un rato después, re-save con la misma lista (no diff): no debe re-bumpear.
    await new Promise((r) => setTimeout(r, 30));
    await service.setAutoBumpSlots(sellerId, [product.id]);
    const secondBump = (await prisma.product.findUnique({ where: { id: product.id } }))!.bumpedAt;

    expect(secondBump.getTime()).toBe(firstBump.getTime());
  });

  it('Only the slotted product bumps: sibling products untouched', async () => {
    const staleAt = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const p1 = await makeProduct(prisma, { sellerId, categoryId });
    const p2 = await makeProduct(prisma, { sellerId, categoryId });
    await prisma.product.updateMany({
      where: { id: { in: [p1.id, p2.id] } },
      data: { bumpedAt: staleAt },
    });
    await prisma.autoBumpSlot.create({
      data: { userId: sellerId, productId: p1.id, cadence: 'DAILY' },
    });

    await service.autoBump();

    const [after1, after2] = await Promise.all([
      prisma.product.findUnique({ where: { id: p1.id } }),
      prisma.product.findUnique({ where: { id: p2.id } }),
    ]);
    expect(after1!.bumpedAt.getTime()).toBeGreaterThan(staleAt.getTime());
    expect(after2!.bumpedAt.getTime()).toBe(staleAt.getTime());
  });

  it('Expired plan: slot exists but product NOT bumped', async () => {
    await prisma.user.update({
      where: { id: sellerId },
      data: { planExpiresAt: new Date('2000-01-01') },
    });
    const staleAt = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const product = await makeProduct(prisma, { sellerId, categoryId });
    await prisma.product.update({
      where: { id: product.id },
      data: { bumpedAt: staleAt },
    });
    await prisma.autoBumpSlot.create({
      data: { userId: sellerId, productId: product.id, cadence: 'DAILY' },
    });

    const result = await service.autoBump();
    expect(result.premiumBumped).toBe(0);
  });

  it('Boosted product is bumped even without a slot', async () => {
    const staleAt = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const product = await makeProduct(prisma, { sellerId, categoryId });
    await prisma.product.update({
      where: { id: product.id },
      data: {
        bumpedAt: staleAt,
        boostedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    const result = await service.autoBump();
    expect(result.boostedBumped).toBe(1);
    const after = await prisma.product.findUnique({ where: { id: product.id } });
    expect(after!.bumpedAt.getTime()).toBeGreaterThan(staleAt.getTime());
  });
});
