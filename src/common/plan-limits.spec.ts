import {
  activePlan,
  PLAN_LIMITS,
  PLAN_PRICES,
  BOOST_PRICE,
  BOOST_PRICES,
  DISCOUNT_TIERS,
} from './plan-limits';
import { UserPlan } from '../users/dto/user-plan.enum';

describe('activePlan', () => {
  const past = new Date('2020-01-01');
  const future = new Date('2099-01-01');

  it('returns FREE for a null user', () => {
    expect(activePlan(null)).toBe(UserPlan.FREE);
  });

  it('returns FREE for a user already on FREE', () => {
    expect(activePlan({ plan: UserPlan.FREE, planExpiresAt: null })).toBe(UserPlan.FREE);
  });

  it('returns BASIC for an unexpired BASIC', () => {
    expect(activePlan({ plan: UserPlan.BASIC, planExpiresAt: future })).toBe(UserPlan.BASIC);
  });

  it('returns STAR for an unexpired STAR', () => {
    expect(activePlan({ plan: UserPlan.STAR, planExpiresAt: future })).toBe(UserPlan.STAR);
  });

  it('returns PREMIUM for an unexpired PREMIUM', () => {
    expect(activePlan({ plan: UserPlan.PREMIUM, planExpiresAt: future })).toBe(UserPlan.PREMIUM);
  });

  it('downgrades an expired BASIC to FREE', () => {
    expect(activePlan({ plan: UserPlan.BASIC, planExpiresAt: past })).toBe(UserPlan.FREE);
  });

  it('downgrades an expired STAR to FREE', () => {
    expect(activePlan({ plan: UserPlan.STAR, planExpiresAt: past })).toBe(UserPlan.FREE);
  });

  it('downgrades an expired PREMIUM to FREE', () => {
    expect(activePlan({ plan: UserPlan.PREMIUM, planExpiresAt: past })).toBe(UserPlan.FREE);
  });

  it('treats missing planExpiresAt as never-expires (paid plan stays)', () => {
    expect(activePlan({ plan: UserPlan.PREMIUM, planExpiresAt: null })).toBe(UserPlan.PREMIUM);
  });
});

describe('PLAN_LIMITS', () => {
  it('has entries for the four plans', () => {
    expect(PLAN_LIMITS[UserPlan.FREE]).toBeDefined();
    expect(PLAN_LIMITS[UserPlan.BASIC]).toBeDefined();
    expect(PLAN_LIMITS[UserPlan.STAR]).toBeDefined();
    expect(PLAN_LIMITS[UserPlan.PREMIUM]).toBeDefined();
  });

  it('active-product caps grow monotonically FREE < BASIC < STAR < PREMIUM', () => {
    expect(PLAN_LIMITS.FREE.maxActiveProducts).toBeLessThan(PLAN_LIMITS.BASIC.maxActiveProducts);
    expect(PLAN_LIMITS.BASIC.maxActiveProducts).toBeLessThan(PLAN_LIMITS.STAR.maxActiveProducts);
    expect(PLAN_LIMITS.STAR.maxActiveProducts).toBeLessThan(PLAN_LIMITS.PREMIUM.maxActiveProducts);
  });

  it('image caps never shrink as the plan tier rises', () => {
    expect(PLAN_LIMITS.BASIC.maxImagesPerProduct).toBeGreaterThanOrEqual(
      PLAN_LIMITS.FREE.maxImagesPerProduct,
    );
    expect(PLAN_LIMITS.STAR.maxImagesPerProduct).toBeGreaterThanOrEqual(
      PLAN_LIMITS.BASIC.maxImagesPerProduct,
    );
    expect(PLAN_LIMITS.PREMIUM.maxImagesPerProduct).toBeGreaterThanOrEqual(
      PLAN_LIMITS.STAR.maxImagesPerProduct,
    );
  });

  it('included boosts grow monotonically FREE < BASIC < STAR < PREMIUM', () => {
    expect(PLAN_LIMITS.FREE.includedBoostsPerMonth).toBeLessThan(
      PLAN_LIMITS.BASIC.includedBoostsPerMonth,
    );
    expect(PLAN_LIMITS.BASIC.includedBoostsPerMonth).toBeLessThan(
      PLAN_LIMITS.STAR.includedBoostsPerMonth,
    );
    expect(PLAN_LIMITS.STAR.includedBoostsPerMonth).toBeLessThan(
      PLAN_LIMITS.PREMIUM.includedBoostsPerMonth,
    );
  });

  it('only STAR and PREMIUM allow pinned products in the profile', () => {
    expect(PLAN_LIMITS.FREE.pinnedProducts).toBe(0);
    expect(PLAN_LIMITS.BASIC.pinnedProducts).toBe(0);
    expect(PLAN_LIMITS.STAR.pinnedProducts).toBeGreaterThan(0);
    expect(PLAN_LIMITS.PREMIUM.pinnedProducts).toBeGreaterThan(PLAN_LIMITS.STAR.pinnedProducts);
  });
});

describe('PLAN_PRICES', () => {
  it('prices grow monotonically FREE < BASIC < STAR < PREMIUM', () => {
    expect(PLAN_PRICES[UserPlan.FREE]).toBeLessThan(PLAN_PRICES[UserPlan.BASIC]);
    expect(PLAN_PRICES[UserPlan.BASIC]).toBeLessThan(PLAN_PRICES[UserPlan.STAR]);
    expect(PLAN_PRICES[UserPlan.STAR]).toBeLessThan(PLAN_PRICES[UserPlan.PREMIUM]);
  });

  it('FREE is not billable (zero in the ledger)', () => {
    expect(PLAN_PRICES[UserPlan.FREE]).toBe(0);
  });

  it('cheapest boost is cheaper than any paid plan', () => {
    expect(BOOST_PRICE).toBeLessThan(PLAN_PRICES[UserPlan.BASIC]);
  });
});

describe('BOOST_PRICES', () => {
  it('has 3d, 7d and 30d entries', () => {
    expect(BOOST_PRICES['3d']).toBeDefined();
    expect(BOOST_PRICES['7d']).toBeDefined();
    expect(BOOST_PRICES['30d']).toBeDefined();
  });

  it('prices grow with duration', () => {
    expect(BOOST_PRICES['3d']).toBeLessThan(BOOST_PRICES['7d']);
    expect(BOOST_PRICES['7d']).toBeLessThan(BOOST_PRICES['30d']);
  });

  it('BOOST_PRICE compat alias points at the 3d rate', () => {
    expect(BOOST_PRICE).toBe(BOOST_PRICES['3d']);
  });
});

describe('DISCOUNT_TIERS', () => {
  it('covers every month from 1 to 12 with no gaps or overlaps', () => {
    for (let m = 1; m <= 12; m++) {
      const tiers = DISCOUNT_TIERS.filter(t => m >= t.minMonths && m <= t.maxMonths);
      expect(tiers).toHaveLength(1);
    }
  });

  it('short activations have no discount', () => {
    const tier = DISCOUNT_TIERS.find(t => 1 >= t.minMonths && 1 <= t.maxMonths);
    expect(tier?.pct).toBe(0);
  });

  it('12-month activation has the largest discount', () => {
    const yearlyTier = DISCOUNT_TIERS.find(t => 12 >= t.minMonths && 12 <= t.maxMonths);
    const otherTiers = DISCOUNT_TIERS.filter(t => t !== yearlyTier);
    for (const t of otherTiers) {
      expect(yearlyTier!.pct).toBeGreaterThan(t.pct);
    }
  });
});
