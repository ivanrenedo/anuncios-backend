import { InputType, Field, Int } from '@nestjs/graphql';
import { UserPlan } from './user-plan.enum';

@InputType()
export class ActivatePlanInput {
  @Field()
  userId: string;

  @Field(() => UserPlan)
  plan: UserPlan;

  /** Duration in months (1..12). The pricing engine rejects anything else. */
  @Field(() => Int)
  months: number;

  /** Free-text trace for the admin (bank ref, WA screenshot id, …). */
  @Field({ nullable: true })
  notes?: string;
}
