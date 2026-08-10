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

/** List prices in XAF for the manual-payment ledger. */
export const PLAN_PRICES: Record<string, number> = {
  [UserPlan.FREE]: 0,
  [UserPlan.BASIC]: 3000,
  [UserPlan.STAR]: 12000,
  [UserPlan.PREMIUM]: 35000,
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
