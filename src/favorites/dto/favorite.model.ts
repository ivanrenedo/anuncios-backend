import { ObjectType, Field, ID } from '@nestjs/graphql';
import { ProductModel } from '../../products/models/product.model';

@ObjectType()
export class FavoriteModel {
  @Field(() => ID)
  id: string;

  @Field()
  userId: string;

  @Field()
  productId: string;

  @Field()
  createdAt: Date;

  @Field(() => ProductModel, { nullable: true })
  product?: ProductModel;
}
