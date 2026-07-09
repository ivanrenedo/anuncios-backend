import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { AdminGuard } from '../auth/guards/admin.guard';
import { CategoriesService } from './categories.service';
import { CategoryModel } from './dto/category.model';
import { CreateCategoryInput } from './dto/create-category.input';
import { UpdateCategoryInput } from './dto/update-category.input';

@Resolver(() => CategoryModel)
export class CategoriesResolver {
  constructor(private service: CategoriesService) {}

  @Query(() => [CategoryModel])
  async categories() {
    return this.service.findAll();
  }

  /** Top-level categories with nested children. Replaces `classifications`. */
  @Query(() => [CategoryModel])
  async categoryTree() {
    return this.service.findRoots();
  }

  @Query(() => CategoryModel)
  async category(@Args('id') id: string) {
    return this.service.findOne(id);
  }

  @Query(() => CategoryModel)
  async categoryBySlug(@Args('slug') slug: string) {
    return this.service.findBySlug(slug);
  }

  /** Direct children of a category. Replaces `subcategoriesByCategory`. */
  @Query(() => [CategoryModel])
  async categoryChildren(@Args('parentId') parentId: string) {
    return this.service.findChildren(parentId);
  }

  @Mutation(() => CategoryModel)
  @UseGuards(AdminGuard)
  async createCategory(@Args('input') input: CreateCategoryInput) {
    return this.service.create(input);
  }

  @Mutation(() => CategoryModel)
  @UseGuards(AdminGuard)
  async updateCategory(
    @Args('id') id: string,
    @Args('input') input: UpdateCategoryInput,
  ) {
    return this.service.update(id, input);
  }

  @Mutation(() => CategoryModel)
  @UseGuards(AdminGuard)
  async deleteCategory(@Args('id') id: string) {
    return this.service.remove(id);
  }
}
