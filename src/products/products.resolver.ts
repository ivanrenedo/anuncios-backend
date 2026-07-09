import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductModel } from './models/product.model';
import { CreateProductInput } from './dto/create-product.input';
import { UpdateProductInput } from './dto/update-product.input';
import { SearchProductsInput } from './dto/search-products.input';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { GetCurrentUserId } from '../auth/decorators/current-user.decorator';

@Resolver(() => ProductModel)
export class ProductsResolver {
  constructor(private service: ProductsService) {}

  @Query(() => [ProductModel])
  async products(
    @Args('take', { type: () => Int, nullable: true }) take?: number,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
  ) {
    return this.service.findAll(take, skip);
  }

  @Query(() => ProductModel)
  async product(@Args('id') id: string) {
    return this.service.findOne(id);
  }

  /** All products regardless of status — admin panel only. */
  @Query(() => [ProductModel])
  @UseGuards(AdminGuard)
  async allProducts(
    @Args('take', { type: () => Int, nullable: true }) take?: number,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
  ) {
    return this.service.findAllAdmin(take, skip);
  }

  @Query(() => [ProductModel])
  async searchProducts(@Args('input') input: SearchProductsInput) {
    return this.service.search(input);
  }

  @Query(() => [ProductModel])
  async productsByCategory(
    @Args('categoryId') categoryId: string,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
  ) {
    return this.service.findByCategory(categoryId, take, skip);
  }

  @Query(() => [ProductModel])
  async productsBySeller(@Args('sellerId') sellerId: string) {
    return this.service.findBySeller(sellerId);
  }

  @Mutation(() => ProductModel)
  @UseGuards(GqlAuthGuard)
  async createProduct(
    @GetCurrentUserId() userId: string,
    @Args('input') input: CreateProductInput,
  ) {
    return this.service.create(userId, input);
  }

  @Mutation(() => ProductModel)
  @UseGuards(GqlAuthGuard)
  async updateProduct(
    @GetCurrentUserId() userId: string,
    @Args('id') id: string,
    @Args('input') input: UpdateProductInput,
  ) {
    return this.service.update(id, userId, input);
  }

  @Mutation(() => ProductModel)
  @UseGuards(GqlAuthGuard)
  async deleteProduct(@GetCurrentUserId() userId: string, @Args('id') id: string) {
    return this.service.remove(id, userId);
  }

  @Mutation(() => ProductModel)
  async viewProduct(
    @Args('id') id: string,
    @Args('viewerKey', { nullable: true }) viewerKey?: string,
  ) {
    return this.service.registerView(id, viewerKey);
  }
}
