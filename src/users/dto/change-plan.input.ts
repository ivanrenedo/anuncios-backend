import { InputType, Field } from '@nestjs/graphql';
import { UserPlan } from './user-plan.enum';

@InputType()
export class ChangePlanInput {
  @Field()
  userId: string;

  @Field(() => UserPlan)
  plan: UserPlan;

  @Field({ nullable: true })
  expiresAt?: Date;

  @Field({ nullable: true })
  reason?: string;
}
