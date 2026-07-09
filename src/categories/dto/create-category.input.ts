import { InputType, Field, Int } from '@nestjs/graphql';

@InputType()
export class CreateCategoryInput {
  @Field()
  label: string;

  @Field()
  slug: string;

  @Field({ nullable: true })
  color?: string;

  @Field({ nullable: true })
  icon?: string;

  /** Parent category id. Omit for a top-level category. */
  @Field({ nullable: true })
  parentId?: string;

  @Field(() => Int, { nullable: true })
  sortOrder?: number;
}
