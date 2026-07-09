import { InputType, Field, Int } from '@nestjs/graphql';

@InputType()
export class UpdateCategoryInput {
  @Field({ nullable: true })
  label?: string;

  @Field({ nullable: true })
  slug?: string;

  @Field({ nullable: true })
  color?: string;

  @Field({ nullable: true })
  icon?: string;

  /** Re-parent the category. Pass null to make it a top-level category. */
  @Field({ nullable: true })
  parentId?: string;

  @Field(() => Int, { nullable: true })
  sortOrder?: number;
}
