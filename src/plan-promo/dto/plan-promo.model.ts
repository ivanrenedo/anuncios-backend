import { ObjectType, Field, Int, Float } from '@nestjs/graphql';
import { UserPlan } from '../../users/dto/user-plan.enum';

/**
 * Full promo configuration. Admin-only: it exposes the switches an admin can
 * flip, including the window boundaries of a promo that hasn't started yet.
 */
@ObjectType()
export class PlanPromoModel {
  @Field()
  enabled: boolean;

  /** True only when `enabled` and `now` is inside the window. */
  @Field()
  active: boolean;

  @Field({ nullable: true })
  startsAt: Date | null;

  @Field({ nullable: true })
  endsAt: Date | null;

  @Field(() => UserPlan)
  grantedPlan: UserPlan;

  @Field()
  unlockLimits: boolean;

  @Field()
  unlockPinned: boolean;

  @Field()
  unlockAutoBump: boolean;

  @Field()
  unlockStats: boolean;

  @Field()
  freeBoosts: boolean;

  @Field({ nullable: true })
  bannerText: string | null;

  @Field({ nullable: true })
  updatedAt: Date | null;
}

/**
 * What the storefront and the app need to know: whether the promo is running
 * right now, until when, and what to put in the banner. Public — it carries no
 * admin-only detail (a scheduled-but-not-started promo reads as inactive).
 */
@ObjectType()
export class PublicPlanPromoModel {
  @Field()
  active: boolean;

  @Field({ nullable: true })
  endsAt: Date | null;

  @Field(() => UserPlan, { nullable: true })
  grantedPlan: UserPlan | null;

  @Field({ nullable: true })
  bannerText: string | null;

  @Field()
  unlockLimits: boolean;

  @Field()
  unlockPinned: boolean;

  @Field()
  unlockAutoBump: boolean;

  @Field()
  unlockStats: boolean;

  @Field()
  freeBoosts: boolean;
}

/**
 * Everything the caller is actually allowed to do, promo already folded in.
 * Clients gate on this instead of comparing plan strings, so a partial promo
 * (only some modules unlocked) renders correctly.
 */
@ObjectType()
export class MyEntitlementsModel {
  /** Plan the seller pays for — what badges keep showing. */
  @Field(() => UserPlan)
  plan: UserPlan;

  /** Plan whose features are in force. Equals `plan` outside the promo. */
  @Field(() => UserPlan)
  entitlementPlan: UserPlan;

  /** True when at least one of these limits comes from the promo. */
  @Field()
  promoActive: boolean;

  @Field({ nullable: true })
  promoEndsAt: Date | null;

  @Field(() => Int)
  maxActiveProducts: number;

  @Field(() => Int)
  maxImagesPerProduct: number;

  @Field(() => Int)
  pinnedProducts: number;

  @Field(() => Int)
  autoBumpSlots: number;

  @Field({ nullable: true })
  autoBumpCadence: string | null;

  @Field(() => Int)
  includedBoostsPerMonth: number;

  @Field(() => Float)
  extraBoostDiscountPct: number;

  /** Profile analytics + QR scan tracking. */
  @Field()
  hasStats: boolean;

  /** Boosts cost 0 XAF for everybody right now. */
  @Field()
  freeBoosts: boolean;
}
