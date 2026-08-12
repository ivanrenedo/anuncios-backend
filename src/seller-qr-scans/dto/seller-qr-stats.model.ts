import { ObjectType, Field, Int } from '@nestjs/graphql';

@ObjectType()
export class SellerQrStatsModel {
  @Field(() => Int)
  total: number;

  @Field(() => Int)
  thisMonth: number;

  @Field(() => Int)
  last30Days: number;

  @Field({ nullable: true })
  lastScanAt?: Date;
}
