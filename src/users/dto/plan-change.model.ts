import { ObjectType, Field, ID } from '@nestjs/graphql';
import { UserPlan } from './user-plan.enum';

@ObjectType()
export class PlanChangeModel {
  @Field(() => ID)
  id: string;

  @Field()
  userId: string;

  @Field(() => UserPlan)
  oldPlan: UserPlan;

  @Field(() => UserPlan)
  newPlan: UserPlan;

  @Field({ nullable: true })
  expiresAt?: Date;

  @Field({ nullable: true })
  reason?: string;

  @Field()
  changedById: string;

  @Field()
  createdAt: Date;
}
