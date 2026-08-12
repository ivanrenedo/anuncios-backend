import { UserPlan } from '../users/dto/user-plan.enum';
import { PLAN_PRICES, DISCOUNT_TIERS } from './plan-limits';

export interface PlanTotalBreakdown {
  plan: UserPlan;
  months: number;
  /** Snapshot of PLAN_PRICES[plan] at calc time. XAF per month. */
  unitPrice: number;
  /** unitPrice × months, before discount. */
  gross: number;
  /** 0, 0.05, 0.10, 0.25 — resolved from DISCOUNT_TIERS. */
  discountPct: number;
  /** Absolute XAF taken off `gross`. Exposed so the admin preview can show
   *  "Descuento (-10 %): -21.000 XAF" verbatim. */
  discountAmount: number;
  /** gross - discountAmount. Always an integer number of XAF. */
  total: number;
}

/**
 * Compute the total an admin is about to charge for `months` of `plan`.
 * Pure, rounds to whole XAF (Payment.amount is Decimal(12,2) but the ledger
 * only ever sees whole units in this currency).
 *
 * Throws if `months` is outside the 1..12 window supported by the admin
 * picker, or if `plan` is unknown. FREE resolves to a zero-cost breakdown.
 */
export function calculatePlanTotal(
  plan: UserPlan,
  months: number,
): PlanTotalBreakdown {
  if (!Number.isInteger(months) || months < 1 || months > 12) {
    throw new Error(
      `calculatePlanTotal: months must be an integer in [1, 12] (got ${months})`,
    );
  }
  const unitPrice = PLAN_PRICES[plan];
  if (unitPrice === undefined) {
    throw new Error(`calculatePlanTotal: unknown plan "${plan}"`);
  }
  const gross = unitPrice * months;
  const discountPct = discountFor(months);
  const discountAmount = Math.round(gross * discountPct);
  const total = gross - discountAmount;
  return { plan, months, unitPrice, gross, discountPct, discountAmount, total };
}

function discountFor(months: number): number {
  const tier = DISCOUNT_TIERS.find(
    (t) => months >= t.minMonths && months <= t.maxMonths,
  );
  if (!tier) {
    throw new Error(`No discount tier defined for ${months} months`);
  }
  return tier.pct;
}

export interface CheaperAtTwelveWarning {
  /** True when 12 months would strictly undercut `months`. Drives the
   *  "usar 12m en su lugar" hint in the admin preview. */
  triggered: boolean;
  currentTotal: number;
  yearlyTotal: number;
  /** currentTotal - yearlyTotal when triggered, 0 otherwise. */
  savings: number;
}

/**
 * Guard against the 11→12 cliff: with the current DISCOUNT_TIERS
 * (10 % vs 25 %), activating exactly 12 months costs less than 11.
 * The helper compares in general terms so a future re-tune of the tiers
 * still surfaces any month where 12 would be a better deal.
 */
export function warnIfCheaperAtTwelve(
  plan: UserPlan,
  months: number,
): CheaperAtTwelveWarning {
  const current = calculatePlanTotal(plan, months);
  if (months === 12 || current.unitPrice === 0) {
    return {
      triggered: false,
      currentTotal: current.total,
      yearlyTotal: current.total,
      savings: 0,
    };
  }
  const yearly = calculatePlanTotal(plan, 12);
  const cheaper = yearly.total < current.total;
  return {
    triggered: cheaper,
    currentTotal: current.total,
    yearlyTotal: yearly.total,
    savings: cheaper ? current.total - yearly.total : 0,
  };
}
