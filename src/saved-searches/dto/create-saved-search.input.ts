import { InputType, Field, Float } from '@nestjs/graphql';

@InputType()
export class CreateSavedSearchInput {
  @Field({ nullable: true })
  query?: string;

  @Field({ nullable: true })
  categoryId?: string;

  @Field({ nullable: true })
  city?: string;

  @Field(() => Float, { nullable: true })
  priceMin?: number;

  @Field(() => Float, { nullable: true })
  priceMax?: number;
}
