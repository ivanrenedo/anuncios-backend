import { ObjectType, Field, ID, Float } from '@nestjs/graphql';
import { UserModel } from '../../users/dto/user.model';

@ObjectType()
export class PaymentModel {
  @Field(() => ID)
  id: string;

  @Field()
  userId: string;

  @Field(() => Float)
  amount: number;

  @Field()
  currency: string;

  /** plan_star | plan_premium | boost */
  @Field()
  concept: string;

  @Field({ nullable: true })
  note?: string;

  @Field({ nullable: true })
  productId?: string;

  @Field()
  createdAt: Date;

  @Field(() => UserModel, { nullable: true })
  user?: UserModel;

  @Field(() => UserModel, { nullable: true })
  createdBy?: UserModel;
}
