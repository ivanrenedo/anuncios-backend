import { ObjectType, Field, ID, Int, Float } from '@nestjs/graphql';
import { UserPlan } from './user-plan.enum';

@ObjectType()
export class PlanActivationModel {
  @Field(() => ID)
  id: string;

  @Field()
  userId: string;

  @Field(() => UserPlan)
  plan: UserPlan;

  @Field(() => Int)
  months: number;

  @Field(() => Float)
  unitPrice: number;

  /** Fraction 0..1 (e.g. 0.10 for 10 %). */
  @Field(() => Float)
  discountPct: number;

  @Field(() => Float)
  totalPaid: number;

  @Field({ nullable: true })
  activatedByAdminId?: string;

  @Field()
  activatedAt: Date;

  @Field()
  startsAt: Date;

  @Field()
  endsAt: Date;

  @Field({ nullable: true })
  notes?: string;
}

@ObjectType()
export class CheaperAtTwelveWarningModel {
  @Field()
  triggered: boolean;

  @Field(() => Float)
  currentTotal: number;

  @Field(() => Float)
  yearlyTotal: number;

  @Field(() => Float)
  savings: number;
}

/**
 * Pure preview returned by `planTotalPreview` — no DB write. Lets the admin
 * panel render the desglose ("Descuento −10 %: −21.000 XAF") and the "usar
 * 12 meses en su lugar" hint before the admin confirms.
 */
@ObjectType()
export class PlanTotalPreviewModel {
  @Field(() => UserPlan)
  plan: UserPlan;

  @Field(() => Int)
  months: number;

  @Field(() => Float)
  unitPrice: number;

  @Field(() => Float)
  gross: number;

  @Field(() => Float)
  discountPct: number;

  @Field(() => Float)
  discountAmount: number;

  @Field(() => Float)
  total: number;

  @Field(() => CheaperAtTwelveWarningModel)
  cheaperAtTwelve: CheaperAtTwelveWarningModel;
}
