import { ObjectType, Field, ID } from '@nestjs/graphql';
import { UserModel } from '../../users/dto/user.model';

@ObjectType()
export class FollowerModel {
  @Field(() => ID)
  id: string;

  @Field()
  followerId: string;

  @Field()
  followedId: string;

  @Field()
  createdAt: Date;

  @Field(() => UserModel, { nullable: true })
  follower?: UserModel;

  @Field(() => UserModel, { nullable: true })
  followed?: UserModel;
}
