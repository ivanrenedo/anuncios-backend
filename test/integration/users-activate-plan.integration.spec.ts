import { PrismaClient } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UsersService } from '../../src/users/users.service';
import { AuditService } from '../../src/audit/audit.service';
import { StorageService } from '../../src/upload/storage.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PlanPromoService } from '../../src/plan-promo/plan-promo.service';
import { UserPlan } from '../../src/users/dto/user-plan.enum';
import { newTestPrisma, truncateAll, newTestPromo } from './prisma-test.helper';
import { makeUser } from './factories';

/**
 * `UsersService.activatePlan` is the v2 admin flow. It's more involved than the
 * legacy `changePlan` because it (a) computes the total from an in-code
 * pricing engine and (b) applies an upgrade/renewal policy that differs
 * depending on whether the target plan matches the current one.
 *
 * The invariants pinned here (docs/plans-v2-decisions.md):
 *   - same plan + still active   → accumulate (endsAt = old endsAt + months*30d)
 *   - same plan + expired        → replace    (endsAt = now + months*30d)
 *   - different plan             → replace    (remaining time lost)
 *   - 12 months → planCycle YEARLY, everything else MONTHLY
 *   - FREE never writes a Payment row, but still writes PlanActivation + PlanChange
 *   - Payment amount == PlanActivation.totalPaid (post-discount, not gross)
 */
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

describe('UsersService.activatePlan (integration)', () => {
  let prisma: PrismaClient;
  let service: UsersService;
  let events: EventEmitter2;
  let adminId: string;
  let userId: string;

  beforeAll(() => {
    prisma = newTestPrisma();
    events = new EventEmitter2();
    const audit = new AuditService(prisma as unknown as PrismaService);
    service = new UsersService(
      prisma as unknown as PrismaService,
      events,
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
    const admin = await makeUser(prisma, { name: 'Admin' });
    const user = await makeUser(prisma, { name: 'Seller', plan: 'FREE' });
    adminId = admin.id;
    userId = user.id;
  });

  describe('new activation (FREE → paid)', () => {
    it('PREMIUM × 6 months: writes User, PlanActivation, PlanChange, Payment with 189.000 XAF', async () => {
      const before = Date.now();
      const activation = await service.activatePlan(adminId, {
        userId,
        plan: UserPlan.PREMIUM,
        months: 6,
      });
      const after = Date.now();

      expect(activation.plan).toBe('PREMIUM');
      expect(activation.months).toBe(6);
      expect(Number(activation.unitPrice)).toBe(35_000);
      expect(Number(activation.discountPct)).toBe(0.1);
      expect(Number(activation.totalPaid)).toBe(189_000);

      const user = await prisma.user.findUnique({ where: { id: userId } });
      expect(user!.plan).toBe('PREMIUM');
      expect(user!.planCycle).toBe('MONTHLY');
      expect(user!.planStartedAt!.getTime()).toBeGreaterThanOrEqual(before);
      expect(user!.planStartedAt!.getTime()).toBeLessThanOrEqual(after);
      // endsAt = now + 6 × 30 days
      const expectedEnd = user!.planStartedAt!.getTime() + 6 * MONTH_MS;
      expect(user!.planExpiresAt!.getTime()).toBe(expectedEnd);

      const [payment] = await prisma.payment.findMany({ where: { userId } });
      expect(payment.concept).toBe('plan_premium');
      expect(Number(payment.amount)).toBe(189_000);
      expect(payment.createdById).toBe(adminId);

      const [planChange] = await prisma.planChange.findMany({
        where: { userId },
      });
      expect(planChange.oldPlan).toBe('FREE');
      expect(planChange.newPlan).toBe('PREMIUM');
      expect(planChange.expiresAt!.getTime()).toBe(
        user!.planExpiresAt!.getTime(),
      );
    });

    it('BASIC × 3 months applies 5 % discount: totalPaid = 8.550 XAF', async () => {
      const activation = await service.activatePlan(adminId, {
        userId,
        plan: UserPlan.BASIC,
        months: 3,
      });
      expect(Number(activation.totalPaid)).toBe(8_550);
      const [payment] = await prisma.payment.findMany({ where: { userId } });
      expect(payment.concept).toBe('plan_basic');
      expect(Number(payment.amount)).toBe(8_550);
    });

    it('STAR × 12 months sets planCycle = YEARLY and totalPaid = 108.000 XAF', async () => {
      const activation = await service.activatePlan(adminId, {
        userId,
        plan: UserPlan.STAR,
        months: 12,
      });
      expect(Number(activation.totalPaid)).toBe(108_000);
      const user = await prisma.user.findUnique({ where: { id: userId } });
      expect(user!.planCycle).toBe('YEARLY');
    });
  });

  describe('renewal (same plan, still active) — accumulate', () => {
    it('extends planExpiresAt from the previous endsAt, not from now', async () => {
      // Prime: user is on PREMIUM until 60 days from now.
      const primeExpires = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
      const primeStarted = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      await prisma.user.update({
        where: { id: userId },
        data: {
          plan: 'PREMIUM',
          planExpiresAt: primeExpires,
          planStartedAt: primeStarted,
        },
      });

      const activation = await service.activatePlan(adminId, {
        userId,
        plan: UserPlan.PREMIUM,
        months: 3,
      });

      // startsAt of the new activation == where the previous one ended.
      expect(activation.startsAt.getTime()).toBe(primeExpires.getTime());
      expect(activation.endsAt.getTime()).toBe(
        primeExpires.getTime() + 3 * MONTH_MS,
      );

      const user = await prisma.user.findUnique({ where: { id: userId } });
      expect(user!.planExpiresAt!.getTime()).toBe(activation.endsAt.getTime());
      // planStartedAt kept — same continuous subscription period.
      expect(user!.planStartedAt!.getTime()).toBe(primeStarted.getTime());
    });
  });

  describe('renewal (same plan, expired) — replace', () => {
    it('resets planStartedAt to now and endsAt to now + months', async () => {
      const past = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      await prisma.user.update({
        where: { id: userId },
        data: { plan: 'STAR', planExpiresAt: past, planStartedAt: past },
      });

      const before = Date.now();
      const activation = await service.activatePlan(adminId, {
        userId,
        plan: UserPlan.STAR,
        months: 6,
      });
      const after = Date.now();

      expect(activation.startsAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(activation.startsAt.getTime()).toBeLessThanOrEqual(after);

      const user = await prisma.user.findUnique({ where: { id: userId } });
      expect(user!.planStartedAt!.getTime()).not.toBe(past.getTime());
      expect(user!.planStartedAt!.getTime()).toBeGreaterThanOrEqual(before);
    });
  });

  describe('plan change (different plan, still active) — replace', () => {
    it('PREMIUM active → BASIC 3m: BASIC starts now and PREMIUM remaining time is lost', async () => {
      const originalEnd = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
      await prisma.user.update({
        where: { id: userId },
        data: {
          plan: 'PREMIUM',
          planExpiresAt: originalEnd,
          planStartedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
      });

      const before = Date.now();
      const activation = await service.activatePlan(adminId, {
        userId,
        plan: UserPlan.BASIC,
        months: 3,
      });

      // startsAt is now, NOT the original PREMIUM endsAt.
      expect(activation.startsAt.getTime()).toBeGreaterThanOrEqual(before);
      // endsAt is now + 3 months, not originalEnd + 3 months.
      expect(activation.endsAt.getTime()).toBeLessThan(
        originalEnd.getTime() + 3 * MONTH_MS,
      );

      const user = await prisma.user.findUnique({ where: { id: userId } });
      expect(user!.plan).toBe('BASIC');
      expect(user!.planExpiresAt!.getTime()).toBe(activation.endsAt.getTime());
    });
  });

  describe('FREE activation edge case', () => {
    it('activating FREE still writes User + PlanChange + PlanActivation but NO Payment', async () => {
      await prisma.user.update({
        where: { id: userId },
        data: {
          plan: 'STAR',
          planExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
        },
      });

      await service.activatePlan(adminId, {
        userId,
        plan: UserPlan.FREE,
        months: 1,
      });

      const payments = await prisma.payment.findMany({ where: { userId } });
      expect(payments).toHaveLength(0);

      const activations = await prisma.planActivation.findMany({
        where: { userId },
      });
      expect(activations).toHaveLength(1);
      expect(Number(activations[0].totalPaid)).toBe(0);
    });
  });

  describe('validation and side effects', () => {
    it('rejects months outside [1,12] with the pricing-engine error', async () => {
      await expect(
        service.activatePlan(adminId, {
          userId,
          plan: UserPlan.PREMIUM,
          months: 13,
        }),
      ).rejects.toThrow(/months must be an integer/);
    });

    it('throws NotFoundException when the target user does not exist', async () => {
      await expect(
        service.activatePlan(adminId, {
          userId: '00000000-0000-0000-0000-000000000000',
          plan: UserPlan.STAR,
          months: 1,
        }),
      ).rejects.toThrow('Usuario no encontrado');
    });

    it('records an admin_actions row (fire-and-forget)', async () => {
      await service.activatePlan(adminId, {
        userId,
        plan: UserPlan.STAR,
        months: 6,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const actions = await prisma.adminAction.findMany({ where: { adminId } });
      expect(actions).toHaveLength(1);
      expect(actions[0]).toMatchObject({
        action: 'activate_plan',
        targetType: 'user',
        targetId: userId,
      });
      expect(actions[0].detail).toContain('STAR');
      expect(actions[0].detail).toContain('6m');
      expect(actions[0].detail).toContain('64800');
    });

    it('emits UserSecurity notification event on every activation', async () => {
      const spy = jest.fn();
      events.on('user.security', spy);

      await service.activatePlan(adminId, {
        userId,
        plan: UserPlan.PREMIUM,
        months: 1,
      });

      await new Promise((resolve) => setImmediate(resolve));
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0]).toMatchObject({ userId });
    });

    it('persists optional notes verbatim on both PlanActivation and Payment', async () => {
      await service.activatePlan(adminId, {
        userId,
        plan: UserPlan.STAR,
        months: 3,
        notes: 'WA ref #4821',
      });

      const [activation] = await prisma.planActivation.findMany({
        where: { userId },
      });
      expect(activation.notes).toBe('WA ref #4821');

      const [payment] = await prisma.payment.findMany({ where: { userId } });
      expect(payment.note).toBe('WA ref #4821');
    });
  });
});

describe('UsersService.planTotalPreview (unit)', () => {
  let service: UsersService;

  beforeAll(() => {
    // Preview is pure — no Prisma or events touched. Pass minimal stubs.
    service = new UsersService(
      {} as PrismaService,
      {} as EventEmitter2,
      {} as AuditService,
      {} as StorageService,
      {} as PlanPromoService,
    );
  });

  it('returns breakdown for Premium × 6 months with cheaperAtTwelve not triggered', () => {
    const preview = service.planTotalPreview(UserPlan.PREMIUM, 6);
    expect(preview.total).toBe(189_000);
    expect(preview.discountPct).toBe(0.1);
    expect(preview.cheaperAtTwelve.triggered).toBe(false);
  });

  it('warns cheaperAtTwelve at 11 months for Premium (savings 31.500)', () => {
    const preview = service.planTotalPreview(UserPlan.PREMIUM, 11);
    expect(preview.cheaperAtTwelve).toMatchObject({
      triggered: true,
      currentTotal: 346_500,
      yearlyTotal: 315_000,
      savings: 31_500,
    });
  });
});
