import { UserPlan } from '../users/dto/user-plan.enum';

export const PLAN_LIMITS = {
  [UserPlan.FREE]: {
    maxActiveProducts: 5,
    maxImagesPerProduct: 4,
    includedBoostsPerMonth: 0,
    extraBoostDiscountPct: 0,
    pinnedProducts: 0,
    autoBumpSlots: 0,
    autoBumpCadence: null as 'DAILY' | 'WEEKLY' | null,
  },
  [UserPlan.BASIC]: {
    maxActiveProducts: 15,
    maxImagesPerProduct: 4,
    includedBoostsPerMonth: 1,
    extraBoostDiscountPct: 0,
    pinnedProducts: 0,
    autoBumpSlots: 0,
    autoBumpCadence: null as 'DAILY' | 'WEEKLY' | null,
  },
  [UserPlan.STAR]: {
    maxActiveProducts: 30,
    maxImagesPerProduct: 6,
    includedBoostsPerMonth: 3,
    extraBoostDiscountPct: 0,
    pinnedProducts: 4,
    autoBumpSlots: 3,
    autoBumpCadence: 'WEEKLY' as 'DAILY' | 'WEEKLY' | null,
  },
  [UserPlan.PREMIUM]: {
    maxActiveProducts: 100,
    maxImagesPerProduct: 6,
    includedBoostsPerMonth: 8,
    extraBoostDiscountPct: 0.5,
    pinnedProducts: 10,
    autoBumpSlots: 5,
    autoBumpCadence: 'DAILY' as 'DAILY' | 'WEEKLY' | null,
  },
} as const;

/** List prices in XAF for the manual-payment ledger. Source of truth is the
 *  plans catalogue rendered by frontend/mobile — keep these in sync. */
export const PLAN_PRICES: Record<string, number> = {
  [UserPlan.FREE]: 0,
  [UserPlan.BASIC]: 3000,
  [UserPlan.STAR]: 12000,
  [UserPlan.PREMIUM]: 35000,
};

/** Ledger `concept` label used when logging a plan activation as a payment
 *  row. Any new paid plan must be added here — the previous ternary silently
 *  bucketed unknown plans as `plan_premium`, which corrupted accounting. */
export const PLAN_CONCEPTS: Record<string, string> = {
  [UserPlan.BASIC]: 'plan_basic',
  [UserPlan.STAR]: 'plan_star',
  [UserPlan.PREMIUM]: 'plan_premium',
};

/** Boost durations and their XAF prices. */
export const BOOST_PRICES = {
  '3d': 1000,
  '7d': 2000,
  '30d': 5000,
} as const;

export type BoostDuration = keyof typeof BOOST_PRICES;

// Compat: old callsites bill boosts at the 3-day rate.
// Retire once the boost picker (Fase 5) lets sellers choose duration.
export const BOOST_PRICE = BOOST_PRICES['3d'];

/**
 * Discount by volume applied to the total of a multi-month plan activation.
 * See docs/plans-v2-decisions.md for the rationale.
 */
export const DISCOUNT_TIERS: ReadonlyArray<{
  minMonths: number;
  maxMonths: number;
  pct: number;
}> = [
  { minMonths: 1, maxMonths: 2, pct: 0 },
  { minMonths: 3, maxMonths: 5, pct: 0.05 },
  { minMonths: 6, maxMonths: 11, pct: 0.1 },
  { minMonths: 12, maxMonths: 12, pct: 0.25 },
];

/** The plan that is actually in force: paid plans downgrade to FREE once expired. */
export function activePlan(
  user: { plan: string; planExpiresAt: Date | null } | null,
): UserPlan {
  if (!user) return UserPlan.FREE;
  if (user.plan === UserPlan.FREE) return UserPlan.FREE;
  if (user.planExpiresAt && user.planExpiresAt < new Date()) {
    return UserPlan.FREE;
  }
  return user.plan as UserPlan;
}

/** Ordering used whenever two plans have to be compared ("keep the better one"). */
export const PLAN_RANK: Record<UserPlan, number> = {
  [UserPlan.FREE]: 0,
  [UserPlan.BASIC]: 1,
  [UserPlan.STAR]: 2,
  [UserPlan.PREMIUM]: 3,
};

export type PlanLimits = {
  maxActiveProducts: number;
  maxImagesPerProduct: number;
  includedBoostsPerMonth: number;
  extraBoostDiscountPct: number;
  pinnedProducts: number;
  autoBumpSlots: number;
  autoBumpCadence: 'DAILY' | 'WEEKLY' | null;
};

/**
 * Resolved snapshot of the platform-wide promo, as the rest of the backend
 * consumes it. `active` already folds in the enabled flag and the date window
 * so no caller has to re-check the clock.
 */
export interface PromoState {
  active: boolean;
  grantedPlan: UserPlan;
  unlockLimits: boolean;
  unlockPinned: boolean;
  unlockAutoBump: boolean;
  unlockStats: boolean;
  freeBoosts: boolean;
  endsAt: Date | null;
}

/** Neutral state: everything behaves exactly as it did before the promo existed. */
export const PROMO_OFF: PromoState = {
  active: false,
  grantedPlan: UserPlan.FREE,
  unlockLimits: false,
  unlockPinned: false,
  unlockAutoBump: false,
  unlockStats: false,
  freeBoosts: false,
  endsAt: null,
};

const CADENCE_RANK = { DAILY: 2, WEEKLY: 1 } as const;

function bestCadence(
  a: 'DAILY' | 'WEEKLY' | null,
  b: 'DAILY' | 'WEEKLY' | null,
): 'DAILY' | 'WEEKLY' | null {
  if (a == null) return b;
  if (b == null) return a;
  return CADENCE_RANK[a] >= CADENCE_RANK[b] ? a : b;
}

/**
 * The limits actually in force for a seller: their paid plan, widened
 * module-by-module by whatever the promo unlocks.
 *
 * Every merge takes the *better* of the two sides, so a Premium seller can
 * never come out worse when the promo grants a lower plan, and turning the
 * promo off can never take away something the seller paid for.
 */
export function effectiveLimits(
  paidPlan: UserPlan,
  promo: PromoState = PROMO_OFF,
): PlanLimits {
  const own = PLAN_LIMITS[paidPlan];
  if (!promo.active) return { ...own };
  const gift = PLAN_LIMITS[promo.grantedPlan];

  return {
    maxActiveProducts: promo.unlockLimits
      ? Math.max(own.maxActiveProducts, gift.maxActiveProducts)
      : own.maxActiveProducts,
    maxImagesPerProduct: promo.unlockLimits
      ? Math.max(own.maxImagesPerProduct, gift.maxImagesPerProduct)
      : own.maxImagesPerProduct,
    // Included boosts ride on the same switch as free boosts: if boosts are
    // free for everyone the monthly quota is moot, but keeping them in sync
    // means the "te quedan N boosts" copy still reads sensibly.
    includedBoostsPerMonth: promo.freeBoosts
      ? Math.max(own.includedBoostsPerMonth, gift.includedBoostsPerMonth)
      : own.includedBoostsPerMonth,
    extraBoostDiscountPct: promo.freeBoosts
      ? Math.max(own.extraBoostDiscountPct, gift.extraBoostDiscountPct)
      : own.extraBoostDiscountPct,
    pinnedProducts: promo.unlockPinned
      ? Math.max(own.pinnedProducts, gift.pinnedProducts)
      : own.pinnedProducts,
    autoBumpSlots: promo.unlockAutoBump
      ? Math.max(own.autoBumpSlots, gift.autoBumpSlots)
      : own.autoBumpSlots,
    autoBumpCadence: promo.unlockAutoBump
      ? bestCadence(own.autoBumpCadence, gift.autoBumpCadence)
      : own.autoBumpCadence,
  };
}

/**
 * Plan a seller is *entitled to* — what they can do. Distinct from
 * `activePlan()`, which stays the plan they actually paid for and is what
 * badges, the premium carousel and the ledger keep using. Only modules the
 * promo unlocks are considered: with every unlock off, this collapses back to
 * `activePlan()`.
 */
export function entitlementPlan(
  user: { plan: string; planExpiresAt: Date | null } | null,
  promo: PromoState = PROMO_OFF,
): UserPlan {
  const paid = activePlan(user);
  const unlocksAnything =
    promo.unlockLimits ||
    promo.unlockPinned ||
    promo.unlockAutoBump ||
    promo.unlockStats;
  if (!promo.active || !unlocksAnything) return paid;
  return PLAN_RANK[promo.grantedPlan] > PLAN_RANK[paid]
    ? promo.grantedPlan
    : paid;
}

/** Whether seller-side stats (profile analytics + QR scan tracking) are open. */
export function hasStatsAccess(
  paidPlan: UserPlan,
  promo: PromoState = PROMO_OFF,
): boolean {
  const unlocked =
    promo.active && promo.unlockStats
      ? PLAN_RANK[promo.grantedPlan]
      : PLAN_RANK[UserPlan.FREE];
  const rank = Math.max(PLAN_RANK[paidPlan], unlocked);
  return rank >= PLAN_RANK[UserPlan.STAR];
}
