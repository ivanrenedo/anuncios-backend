import { ObjectType, Field, Int, Float } from '@nestjs/graphql';
import { UserPlan } from './user-plan.enum';

@ObjectType()
export class PlanDistributionEntry {
  @Field(() => UserPlan)
  plan: UserPlan;

  @Field(() => Int)
  count: number;
}

@ObjectType()
export class MonthlyActivationsEntry {
  /** YYYY-MM (UTC). */
  @Field()
  month: string;

  @Field(() => Int)
  activations: number;

  /** Sum of totalPaid in XAF. */
  @Field(() => Float)
  revenue: number;
}

/**
 * Aggregate stats for the admin plans dashboard. All numbers are computed on
 * the fly from `User` + `PlanActivation`; no materialised view yet.
 */
@ObjectType()
export class PlanStatsModel {
  /** Users per current effective plan. Sum equals total user count. */
  @Field(() => [PlanDistributionEntry])
  distribution: PlanDistributionEntry[];

  /**
   * Monthly Recurring Revenue = sum of PLAN_PRICES for every user with an
   * active paid plan (planExpiresAt in the future or null). YEARLY plans are
   * included at their monthly-equivalent list price for comparability.
   */
  @Field(() => Float)
  activeMrr: number;

  /**
   * Users whose paid plan expired in the last 30 days AND haven't renewed
   * (i.e. their `planExpiresAt` is now in the past and their current plan is
   * FREE). Proxy for monthly churn.
   */
  @Field(() => Int)
  churnedLast30d: number;

  /** Paid users whose plan expires in the next 7 days. Chase list size. */
  @Field(() => Int)
  expiringNext7d: number;

  /** Bucketed history of activations, useful for a bar chart. */
  @Field(() => [MonthlyActivationsEntry])
  activationsByMonth: MonthlyActivationsEntry[];
}
