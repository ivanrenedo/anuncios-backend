import { InputType, Field } from '@nestjs/graphql';
import { ReportReason, ReportType } from './report.enums';

@InputType()
export class CreateReportInput {
  @Field(() => ReportType)
  type: ReportType;

  @Field(() => ReportReason)
  reason: ReportReason;

  @Field({ nullable: true })
  description?: string;

  /** Required when type = product. */
  @Field({ nullable: true })
  productId?: string;

  /** Required when type = user. */
  @Field({ nullable: true })
  reportedUserId?: string;
}
