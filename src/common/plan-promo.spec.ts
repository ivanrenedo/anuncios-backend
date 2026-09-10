import {
  PLAN_LIMITS,
  PROMO_OFF,
  PromoState,
  effectiveLimits,
  entitlementPlan,
  hasStatsAccess,
} from './plan-limits';
import { UserPlan } from '../users/dto/user-plan.enum';

/** Promo granting Premium features to everybody, every module unlocked. */
const fullPromo: PromoState = {
  active: true,
  grantedPlan: UserPlan.PREMIUM,
  unlockLimits: true,
  unlockPinned: true,
  unlockAutoBump: true,
  unlockStats: true,
  freeBoosts: true,
  endsAt: null,
};

const future = new Date('2099-01-01');
const past = new Date('2020-01-01');

describe('effectiveLimits', () => {
  it('is the plain plan table when there is no promo', () => {
    for (const plan of Object.values(UserPlan)) {
      expect(effectiveLimits(plan, PROMO_OFF)).toEqual(PLAN_LIMITS[plan]);
    }
  });

  it('is the plain plan table when the promo is configured but inactive', () => {
    const scheduled = { ...fullPromo, active: false };
    expect(effectiveLimits(UserPlan.FREE, scheduled)).toEqual(
      PLAN_LIMITS[UserPlan.FREE],
    );
  });

  it('lifts a FREE seller to the granted plan while the promo runs', () => {
    expect(effectiveLimits(UserPlan.FREE, fullPromo)).toEqual(
      PLAN_LIMITS[UserPlan.PREMIUM],
    );
  });

  it('never takes anything away from a seller above the granted plan', () => {
    const starPromo: PromoState = { ...fullPromo, grantedPlan: UserPlan.STAR };
    const premium = PLAN_LIMITS[UserPlan.PREMIUM];
    const limits = effectiveLimits(UserPlan.PREMIUM, starPromo);

    expect(limits.maxActiveProducts).toBe(premium.maxActiveProducts);
    expect(limits.pinnedProducts).toBe(premium.pinnedProducts);
    expect(limits.autoBumpSlots).toBe(premium.autoBumpSlots);
    expect(limits.autoBumpCadence).toBe('DAILY');
  });

  it('only widens the modules that are unlocked', () => {
    const partial: PromoState = {
      ...fullPromo,
      unlockLimits: true,
      unlockPinned: false,
      unlockAutoBump: false,
      freeBoosts: false,
    };
    const limits = effectiveLimits(UserPlan.FREE, partial);

    expect(limits.maxActiveProducts).toBe(
      PLAN_LIMITS[UserPlan.PREMIUM].maxActiveProducts,
    );
    expect(limits.pinnedProducts).toBe(0);
    expect(limits.autoBumpSlots).toBe(0);
    expect(limits.autoBumpCadence).toBeNull();
    expect(limits.includedBoostsPerMonth).toBe(0);
  });

  it('keeps the faster cadence when the seller and the promo disagree', () => {
    const weekly: PromoState = { ...fullPromo, grantedPlan: UserPlan.STAR };
    // Premium seller (DAILY) under a STAR promo (WEEKLY) keeps DAILY.
    expect(effectiveLimits(UserPlan.PREMIUM, weekly).autoBumpCadence).toBe(
      'DAILY',
    );
    // Basic seller (none) under the same promo gains WEEKLY.
    expect(effectiveLimits(UserPlan.BASIC, weekly).autoBumpCadence).toBe(
      'WEEKLY',
    );
  });
});

describe('entitlementPlan', () => {
  it('equals the paid plan with no promo', () => {
    expect(
      entitlementPlan(
        { plan: UserPlan.BASIC, planExpiresAt: future },
        PROMO_OFF,
      ),
    ).toBe(UserPlan.BASIC);
  });

  it('grants the promo plan to a FREE seller', () => {
    expect(entitlementPlan(null, fullPromo)).toBe(UserPlan.PREMIUM);
  });

  it('grants the promo plan to a seller whose paid plan expired', () => {
    expect(
      entitlementPlan({ plan: UserPlan.STAR, planExpiresAt: past }, fullPromo),
    ).toBe(UserPlan.PREMIUM);
  });

  it('keeps the higher paid plan when the promo grants less', () => {
    const basicPromo: PromoState = {
      ...fullPromo,
      grantedPlan: UserPlan.BASIC,
    };
    expect(
      entitlementPlan(
        { plan: UserPlan.PREMIUM, planExpiresAt: future },
        basicPromo,
      ),
    ).toBe(UserPlan.PREMIUM);
  });

  it('collapses to the paid plan when only boosts are free', () => {
    const boostsOnly: PromoState = {
      ...fullPromo,
      unlockLimits: false,
      unlockPinned: false,
      unlockAutoBump: false,
      unlockStats: false,
    };
    expect(entitlementPlan(null, boostsOnly)).toBe(UserPlan.FREE);
  });
});

describe('hasStatsAccess', () => {
  it('is closed to FREE and BASIC outside the promo', () => {
    expect(hasStatsAccess(UserPlan.FREE, PROMO_OFF)).toBe(false);
    expect(hasStatsAccess(UserPlan.BASIC, PROMO_OFF)).toBe(false);
  });

  it('is open to STAR and PREMIUM outside the promo', () => {
    expect(hasStatsAccess(UserPlan.STAR, PROMO_OFF)).toBe(true);
    expect(hasStatsAccess(UserPlan.PREMIUM, PROMO_OFF)).toBe(true);
  });

  it('opens to everyone while the promo unlocks stats', () => {
    expect(hasStatsAccess(UserPlan.FREE, fullPromo)).toBe(true);
  });

  it('stays closed when the promo leaves stats locked', () => {
    const noStats: PromoState = { ...fullPromo, unlockStats: false };
    expect(hasStatsAccess(UserPlan.FREE, noStats)).toBe(false);
    // A paying STAR seller is unaffected by that switch.
    expect(hasStatsAccess(UserPlan.STAR, noStats)).toBe(true);
  });

  it('stays closed when the promo grants a plan below STAR', () => {
    const basicPromo: PromoState = {
      ...fullPromo,
      grantedPlan: UserPlan.BASIC,
    };
    expect(hasStatsAccess(UserPlan.FREE, basicPromo)).toBe(false);
  });
});
