import { calculatePlanTotal, warnIfCheaperAtTwelve } from './pricing';
import { UserPlan } from '../users/dto/user-plan.enum';

describe('calculatePlanTotal', () => {
  describe('validation', () => {
    it.each([0, -1, 13, 100])('rejects months=%p (out of [1,12])', (m) => {
      expect(() => calculatePlanTotal(UserPlan.STAR, m)).toThrow(/months must be an integer/);
    });

    it('rejects non-integer months', () => {
      expect(() => calculatePlanTotal(UserPlan.STAR, 1.5)).toThrow(/months must be an integer/);
    });

    it('rejects NaN months', () => {
      expect(() => calculatePlanTotal(UserPlan.STAR, NaN)).toThrow(/months must be an integer/);
    });

    it('rejects unknown plan', () => {
      expect(() => calculatePlanTotal('GOLD' as UserPlan, 1)).toThrow(/unknown plan/);
    });
  });

  describe('FREE plan', () => {
    it.each([1, 6, 12])('at %d months costs 0', (m) => {
      const r = calculatePlanTotal(UserPlan.FREE, m);
      expect(r.total).toBe(0);
      expect(r.gross).toBe(0);
      expect(r.discountAmount).toBe(0);
      expect(r.unitPrice).toBe(0);
    });
  });

  // Tramos vienen de docs/plans-v2-decisions.md y del briefing v2.
  // Cambiar cualquier expectativa aquí exige actualizar también ese doc.
  describe.each([
    { plan: UserPlan.BASIC, unit: 3_000 },
    { plan: UserPlan.STAR, unit: 12_000 },
    { plan: UserPlan.PREMIUM, unit: 35_000 },
  ])('$plan @ $unit XAF/mes', ({ plan, unit }) => {
    it.each([
      { months: 1, expectedPct: 0 },
      { months: 2, expectedPct: 0 },
      { months: 3, expectedPct: 0.05 },
      { months: 5, expectedPct: 0.05 },
      { months: 6, expectedPct: 0.1 },
      { months: 11, expectedPct: 0.1 },
      { months: 12, expectedPct: 0.25 },
    ])('$months months applies $expectedPct discount', ({ months, expectedPct }) => {
      const r = calculatePlanTotal(plan, months);
      const expectedGross = unit * months;
      const expectedDiscount = Math.round(expectedGross * expectedPct);
      expect(r.unitPrice).toBe(unit);
      expect(r.gross).toBe(expectedGross);
      expect(r.discountPct).toBe(expectedPct);
      expect(r.discountAmount).toBe(expectedDiscount);
      expect(r.total).toBe(expectedGross - expectedDiscount);
    });

    it('always returns integer XAF (no fractional currency in ledger)', () => {
      for (let m = 1; m <= 12; m++) {
        const r = calculatePlanTotal(plan, m);
        expect(Number.isInteger(r.total)).toBe(true);
        expect(Number.isInteger(r.discountAmount)).toBe(true);
      }
    });
  });

  describe('reference totals from the briefing (Premium)', () => {
    it('1 mes = 35.000', () => expect(calculatePlanTotal(UserPlan.PREMIUM, 1).total).toBe(35_000));
    it('2 meses = 70.000', () => expect(calculatePlanTotal(UserPlan.PREMIUM, 2).total).toBe(70_000));
    it('3 meses = 99.750', () => expect(calculatePlanTotal(UserPlan.PREMIUM, 3).total).toBe(99_750));
    it('6 meses = 189.000', () => expect(calculatePlanTotal(UserPlan.PREMIUM, 6).total).toBe(189_000));
    it('12 meses = 315.000', () => expect(calculatePlanTotal(UserPlan.PREMIUM, 12).total).toBe(315_000));
  });

  describe('reference totals from the briefing (Estrella)', () => {
    it('1 mes = 12.000', () => expect(calculatePlanTotal(UserPlan.STAR, 1).total).toBe(12_000));
    it('3 meses = 34.200', () => expect(calculatePlanTotal(UserPlan.STAR, 3).total).toBe(34_200));
    it('6 meses = 64.800', () => expect(calculatePlanTotal(UserPlan.STAR, 6).total).toBe(64_800));
    it('12 meses = 108.000', () => expect(calculatePlanTotal(UserPlan.STAR, 12).total).toBe(108_000));
  });

  describe('reference totals from the briefing (Básico)', () => {
    it('1 mes = 3.000', () => expect(calculatePlanTotal(UserPlan.BASIC, 1).total).toBe(3_000));
    it('3 meses = 8.550', () => expect(calculatePlanTotal(UserPlan.BASIC, 3).total).toBe(8_550));
    it('6 meses = 16.200', () => expect(calculatePlanTotal(UserPlan.BASIC, 6).total).toBe(16_200));
    it('12 meses = 27.000', () => expect(calculatePlanTotal(UserPlan.BASIC, 12).total).toBe(27_000));
  });
});

describe('warnIfCheaperAtTwelve', () => {
  it('never triggers at exactly 12 months', () => {
    for (const p of [UserPlan.BASIC, UserPlan.STAR, UserPlan.PREMIUM]) {
      expect(warnIfCheaperAtTwelve(p, 12).triggered).toBe(false);
    }
  });

  it('never triggers for FREE', () => {
    for (let m = 1; m <= 12; m++) {
      expect(warnIfCheaperAtTwelve(UserPlan.FREE, m).triggered).toBe(false);
    }
  });

  describe('triggers at 11 months for every paid plan', () => {
    it.each([
      { plan: UserPlan.BASIC, currentTotal: 29_700, yearlyTotal: 27_000, savings: 2_700 },
      { plan: UserPlan.STAR, currentTotal: 118_800, yearlyTotal: 108_000, savings: 10_800 },
      { plan: UserPlan.PREMIUM, currentTotal: 346_500, yearlyTotal: 315_000, savings: 31_500 },
    ])('$plan @ 11m → savings $savings XAF', ({ plan, currentTotal, yearlyTotal, savings }) => {
      const r = warnIfCheaperAtTwelve(plan, 11);
      expect(r.triggered).toBe(true);
      expect(r.currentTotal).toBe(currentTotal);
      expect(r.yearlyTotal).toBe(yearlyTotal);
      expect(r.savings).toBe(savings);
    });
  });

  it('does not trigger at 10 months for Premium (yearly ties current: both 315.000)', () => {
    const r = warnIfCheaperAtTwelve(UserPlan.PREMIUM, 10);
    expect(r.triggered).toBe(false);
    expect(r.savings).toBe(0);
    expect(r.currentTotal).toBe(315_000);
    expect(r.yearlyTotal).toBe(315_000);
  });

  it.each([1, 2, 3, 5, 6, 9])(
    'does not trigger at %d months for Premium (yearly is more expensive)',
    (m) => {
      const r = warnIfCheaperAtTwelve(UserPlan.PREMIUM, m);
      expect(r.triggered).toBe(false);
      expect(r.savings).toBe(0);
    },
  );

  it('savings field is 0 when not triggered', () => {
    for (const p of [UserPlan.BASIC, UserPlan.STAR, UserPlan.PREMIUM]) {
      for (const m of [1, 2, 3, 5, 6, 9, 10, 12]) {
        expect(warnIfCheaperAtTwelve(p, m).savings).toBe(0);
      }
    }
  });
});
