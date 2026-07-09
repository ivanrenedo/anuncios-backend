import { ObjectType, Field, ID } from '@nestjs/graphql';
import { ReportReason, ReportStatus, ReportType } from './report.enums';
import { UserModel } from '../../users/dto/user.model';
import { ProductModel } from '../../products/models/product.model';

@ObjectType()
export class ReportModel {
  @Field(() => ID)
  id: string;

  @Field(() => ReportType)
  type: ReportType;

  @Field(() => ReportReason)
  reason: ReportReason;

  @Field({ nullable: true })
  description?: string;

  @Field(() => ReportStatus)
  status: ReportStatus;

  @Field()
  reporterId: string;

  @Field({ nullable: true })
  reportedUserId?: string;

  @Field({ nullable: true })
  productId?: string;

  @Field({ nullable: true })
  reviewedById?: string;

  @Field({ nullable: true })
  reviewedAt?: Date;

  @Field({ nullable: true })
  resolutionNote?: string;

  @Field()
  createdAt: Date;

  @Field(() => UserModel, { nullable: true })
  reporter?: UserModel;

  @Field(() => UserModel, { nullable: true })
  reportedUser?: UserModel;

  @Field(() => UserModel, { nullable: true })
  reviewedBy?: UserModel;

  @Field(() => ProductModel, { nullable: true })
  product?: ProductModel;
}
