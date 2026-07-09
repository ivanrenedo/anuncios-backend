import { InputType, Field, Float, Int } from '@nestjs/graphql';

@InputType()
export class SearchProductsInput {
  @Field({ nullable: true })
  query?: string;

  @Field({ nullable: true })
  categoryId?: string;

  @Field({ nullable: true })
  city?: string;

  @Field({ nullable: true })
  condition?: string;

  @Field(() => Float, { nullable: true })
  priceMin?: number;

  @Field(() => Float, { nullable: true })
  priceMax?: number;

  @Field({ nullable: true, defaultValue: 'recent' })
  sortBy?: string;

  @Field(() => Int, { nullable: true, defaultValue: 20 })
  take?: number;

  @Field(() => Int, { nullable: true, defaultValue: 0 })
  skip?: number;
}
