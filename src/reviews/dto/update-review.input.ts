import { InputType, Field, Int } from '@nestjs/graphql';

@InputType()
export class UpdateReviewInput {
  @Field(() => Int)
  rating: number;

  @Field({ nullable: true })
  text?: string;
}
