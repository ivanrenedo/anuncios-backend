import { ObjectType, Field, ID, Int } from '@nestjs/graphql';
import { UserModel } from '../../users/dto/user.model';

@ObjectType()
export class ReviewModel {
  @Field(() => ID)
  id: string;

  @Field()
  authorId: string;

  @Field()
  sellerId: string;

  @Field(() => Int)
  rating: number;

  @Field({ nullable: true })
  text?: string;

  @Field()
  createdAt: Date;

  @Field(() => UserModel, { nullable: true })
  author?: UserModel;

  @Field(() => UserModel, { nullable: true })
  seller?: UserModel;
}
