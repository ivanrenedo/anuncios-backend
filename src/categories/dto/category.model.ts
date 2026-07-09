import { ObjectType, Field, ID, Int } from '@nestjs/graphql';

/**
 * A node in the self-referential category tree (the `menus` table).
 * `parentId === null` means a top-level/root category. Children are nested
 * categories (what used to be "subcategories").
 */
@ObjectType()
export class CategoryModel {
  @Field(() => ID)
  id: string;

  @Field()
  slug: string;

  @Field()
  label: string;

  @Field({ nullable: true })
  color?: string;

  @Field({ nullable: true })
  icon?: string;

  @Field({ nullable: true })
  parentId?: string;

  @Field(() => Int)
  sortOrder: number;

  @Field(() => CategoryModel, { nullable: true })
  parent?: CategoryModel;

  @Field(() => [CategoryModel], { nullable: true })
  children?: CategoryModel[];

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;
}
