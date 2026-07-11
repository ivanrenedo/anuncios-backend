import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductModel, DailyCountModel } from './models/product.model';
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
    @Args('query', { nullable: true }) query?: string,
  ) {
    return this.service.findAllAdmin(take, skip, query);
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
  async deleteProduct(
    @GetCurrentUserId() userId: string,
    @Args('id') id: string,
  ) {
    return this.service.remove(id, userId);
  }

  @Mutation(() => ProductModel)
  async viewProduct(
    @Args('id') id: string,
    @Args('viewerKey', { nullable: true }) viewerKey?: string,
  ) {
    return this.service.registerView(id, viewerKey);
  }

  /** A buyer tapped WhatsApp/call on the listing — contact stat for the seller. */
  @Mutation(() => ProductModel)
  async contactProduct(@Args('id') id: string) {
    return this.service.registerContact(id);
  }

  /** Moderation: hide or restore any listing. */
  @Mutation(() => ProductModel)
  @UseGuards(AdminGuard)
  async adminSetProductStatus(
    @GetCurrentUserId() adminId: string,
    @Args('id') id: string,
    @Args('status') status: string,
    @Args('reason', { nullable: true }) reason?: string,
  ) {
    if (status !== 'active' && status !== 'hide') {
      throw new Error('Estado no válido');
    }
    return this.service.adminSetStatus(id, status, reason, adminId);
  }

  /** Admin fix-up of any listing (no ownership check). */
  @Mutation(() => ProductModel)
  @UseGuards(AdminGuard)
  async adminUpdateProduct(
    @GetCurrentUserId() adminId: string,
    @Args('id') id: string,
    @Args('input') input: UpdateProductInput,
  ) {
    return this.service.adminUpdate(id, input, adminId);
  }

  /** Remove a single image without touching the listing. */
  @Mutation(() => ProductModel)
  @UseGuards(AdminGuard)
  async adminDeleteProductImage(
    @GetCurrentUserId() adminId: string,
    @Args('imageId') imageId: string,
  ) {
    return this.service.adminDeleteImage(imageId, adminId);
  }

  /** Cancel an active boost. */
  @Mutation(() => ProductModel)
  @UseGuards(AdminGuard)
  async unboostProduct(
    @GetCurrentUserId() adminId: string,
    @Args('id') id: string,
  ) {
    return this.service.unboostProduct(id, adminId);
  }

  /** Daily unique-visitor views across the caller's listings (stats chart). */
  @Query(() => [DailyCountModel])
  @UseGuards(GqlAuthGuard)
  async myViewsDaily(
    @GetCurrentUserId() userId: string,
    @Args('days', { type: () => Int, nullable: true }) days?: number,
  ) {
    return this.service.sellerViewsDaily(userId, days ?? 7);
  }

  @Mutation(() => ProductModel)
  @UseGuards(AdminGuard)
  async bumpProduct(
    @GetCurrentUserId() adminId: string,
    @Args('id') id: string,
  ) {
    return this.service.bumpProduct(id, adminId);
  }

  @Mutation(() => ProductModel)
  @UseGuards(AdminGuard)
  async boostProduct(
    @GetCurrentUserId() adminId: string,
    @Args('id') id: string,
    @Args('days', { type: () => Int, nullable: true }) days?: number,
  ) {
    return this.service.boostProduct(id, days ?? 7, adminId);
  }
}
