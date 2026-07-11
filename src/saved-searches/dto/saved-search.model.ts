import { ObjectType, Field, ID, Float } from '@nestjs/graphql';

@ObjectType()
export class SearchTermStatModel {
  @Field()
  term: string;

  @Field()
  count: number;
}

@ObjectType()
export class SavedSearchModel {
  @Field(() => ID)
  id: string;

  @Field()
  userId: string;

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

  @Field()
  createdAt: Date;
}
