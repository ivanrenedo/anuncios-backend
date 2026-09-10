import { ObjectType, Field, Int, Float } from '@nestjs/graphql';
import { UserPlan } from '../../users/dto/user-plan.enum';

@ObjectType()
export class BoostQuotaModel {
  @Field(() => UserPlan)
  plan: UserPlan;

  @Field(() => Int)
  includedPerMonth: number;

  @Field(() => Int)
  usedThisMonth: number;

  @Field(() => Int)
  remainingThisMonth: number;

  @Field(() => Float)
  extraDiscountPct: number;

  /** Boosts are free for everyone right now (promotional period). */
  @Field()
  promoFree: boolean;

  @Field()
  cycleStartsAt: Date;

  @Field()
  cycleEndsAt: Date;
}
