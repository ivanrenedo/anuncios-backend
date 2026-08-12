import { ObjectType, Field, ID } from '@nestjs/graphql';
import { ProductModel } from '../models/product.model';

@ObjectType()
export class AutoBumpSlotModel {
  @Field(() => ID)
  id: string;

  @Field()
  userId: string;

  @Field()
  productId: string;

  /** 'DAILY' | 'WEEKLY' — plan-derived, not user-chosen. */
  @Field()
  cadence: string;

  @Field()
  createdAt: Date;

  @Field(() => ProductModel, { nullable: true })
  product?: ProductModel;
}
