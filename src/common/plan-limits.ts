import { UserPlan } from '../users/dto/user-plan.enum';

export const PLAN_LIMITS = {
  [UserPlan.FREE]: { maxActiveProducts: 5, maxImagesPerProduct: 4 },
  [UserPlan.BASIC]: { maxActiveProducts: 15, maxImagesPerProduct: 4 },
  [UserPlan.STAR]: { maxActiveProducts: 30, maxImagesPerProduct: 6 },
  [UserPlan.PREMIUM]: { maxActiveProducts: 100, maxImagesPerProduct: 10 },
} as const;

/** List prices in XAF for the manual-payment ledger. Source of truth is the
 *  plans catalogue rendered by frontend/mobile — keep these in sync. */
export const PLAN_PRICES: Record<string, number> = {
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
export const BOOST_PRICE = 1000;

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
