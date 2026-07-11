import { UserPlan } from '../users/dto/user-plan.enum';

export const PLAN_LIMITS = {
  [UserPlan.FREE]: { maxActiveProducts: 5, maxImagesPerProduct: 4 },
  [UserPlan.STAR]: { maxActiveProducts: 25, maxImagesPerProduct: 6 },
  [UserPlan.PREMIUM]: { maxActiveProducts: Infinity, maxImagesPerProduct: 10 },
} as const;

/** List prices in XAF for the manual-payment ledger. */
export const PLAN_PRICES: Record<string, number> = {
  [UserPlan.STAR]: 3000,
  [UserPlan.PREMIUM]: 10000,
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
