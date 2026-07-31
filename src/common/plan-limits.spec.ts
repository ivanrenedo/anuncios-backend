import { activePlan, PLAN_LIMITS, PLAN_PRICES, BOOST_PRICE } from './plan-limits';
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

  it('returns STAR for an unexpired STAR', () => {
    expect(activePlan({ plan: UserPlan.STAR, planExpiresAt: future })).toBe(UserPlan.STAR);
  });

  it('returns PREMIUM for an unexpired PREMIUM', () => {
    expect(activePlan({ plan: UserPlan.PREMIUM, planExpiresAt: future })).toBe(UserPlan.PREMIUM);
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
  it('has entries for the three plans', () => {
    expect(PLAN_LIMITS[UserPlan.FREE]).toBeDefined();
    expect(PLAN_LIMITS[UserPlan.STAR]).toBeDefined();
    expect(PLAN_LIMITS[UserPlan.PREMIUM]).toBeDefined();
  });

  it('caps grow monotonically FREE < STAR < PREMIUM (active products)', () => {
    expect(PLAN_LIMITS.FREE.maxActiveProducts).toBeLessThan(PLAN_LIMITS.STAR.maxActiveProducts);
    expect(PLAN_LIMITS.STAR.maxActiveProducts).toBeLessThan(PLAN_LIMITS.PREMIUM.maxActiveProducts);
  });

  it('caps grow monotonically FREE < STAR < PREMIUM (images per product)', () => {
    expect(PLAN_LIMITS.FREE.maxImagesPerProduct).toBeLessThan(PLAN_LIMITS.STAR.maxImagesPerProduct);
    expect(PLAN_LIMITS.STAR.maxImagesPerProduct).toBeLessThan(PLAN_LIMITS.PREMIUM.maxImagesPerProduct);
  });

  it('PREMIUM active-product cap is unbounded (Infinity)', () => {
    expect(PLAN_LIMITS.PREMIUM.maxActiveProducts).toBe(Infinity);
  });
});

describe('PLAN_PRICES', () => {
  it('STAR is cheaper than PREMIUM', () => {
    expect(PLAN_PRICES[UserPlan.STAR]).toBeLessThan(PLAN_PRICES[UserPlan.PREMIUM]);
  });
  it('FREE is not billable (absent from the ledger)', () => {
    expect(PLAN_PRICES[UserPlan.FREE]).toBeUndefined();
  });
  it('BOOST is cheaper than any paid plan (single-anuncio uplift)', () => {
    expect(BOOST_PRICE).toBeLessThan(PLAN_PRICES[UserPlan.STAR]);
  });
});
