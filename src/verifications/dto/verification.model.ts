import { ObjectType, Field, ID } from '@nestjs/graphql';
import { VerificationStatus } from './verification.enums';
import { UserModel } from '../../users/dto/user.model';

@ObjectType()
export class VerificationModel {
  @Field(() => ID)
  id: string;

  @Field()
  userId: string;

  @Field(() => VerificationStatus)
  status: VerificationStatus;

  @Field({ nullable: true })
  rejectedReason?: string;

  @Field({ nullable: true })
  reviewedById?: string;

  @Field({ nullable: true })
  reviewedAt?: Date;

  @Field()
  createdAt: Date;

  @Field(() => UserModel, { nullable: true })
  user?: UserModel;

  @Field(() => UserModel, { nullable: true })
  reviewedBy?: UserModel;
}
