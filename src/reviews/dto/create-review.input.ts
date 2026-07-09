import { InputType, Field, Int } from '@nestjs/graphql';

@InputType()
export class CreateReviewInput {
  @Field()
  sellerId: string;

  @Field(() => Int)
  rating: number;

  @Field({ nullable: true })
  text?: string;
}
