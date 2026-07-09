import { Resolver, Query, Mutation, Args, ObjectType, Field, Float, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { ReviewModel } from './dto/review.model';
import { CreateReviewInput } from './dto/create-review.input';
import { UpdateReviewInput } from './dto/update-review.input';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { GetCurrentUserId } from '../auth/decorators/current-user.decorator';

@ObjectType()
class SellerRating {
  @Field(() => Float)
  average: number;

  @Field(() => Int)
  count: number;
}

@ObjectType()
class TopRatedSeller {
  @Field()
  sellerId: string;

  @Field()
  name: string;

  @Field(() => Float)
  average: number;

  @Field(() => Int)
  count: number;
}

@ObjectType()
class RatingBucket {
  @Field(() => Int)
  stars: number;

  @Field(() => Int)
  count: number;
}

@ObjectType()
class ReviewStats {
  @Field(() => Float)
  average: number;

  @Field(() => Int)
  count: number;

  @Field(() => [RatingBucket])
  distribution: RatingBucket[];
}

@Resolver(() => ReviewModel)
export class ReviewsResolver {
  constructor(private service: ReviewsService) {}

  @Query(() => [ReviewModel])
  async reviewsBySeller(@Args('sellerId') sellerId: string) {
    return this.service.findBySeller(sellerId);
  }

  @Query(() => [ReviewModel])
  @UseGuards(AdminGuard)
  async reviewsByAuthor(@Args('authorId') authorId: string) {
    return this.service.findByAuthor(authorId);
  }

  @Query(() => SellerRating)
  async sellerRating(@Args('sellerId') sellerId: string) {
    return this.service.getSellerRating(sellerId);
  }

  @Query(() => [TopRatedSeller])
  @UseGuards(AdminGuard)
  async topRatedSellers(
    @Args('limit', { type: () => Int, defaultValue: 6 }) limit: number,
  ) {
    return this.service.getTopRatedSellers(limit);
  }

  @Query(() => ReviewStats)
  @UseGuards(AdminGuard)
  async reviewStats() {
    return this.service.getStats();
  }

  @Mutation(() => ReviewModel)
  @UseGuards(GqlAuthGuard)
  async createReview(
    @GetCurrentUserId() userId: string,
    @Args('input') input: CreateReviewInput,
  ) {
    return this.service.create(userId, input);
  }

  @Mutation(() => ReviewModel)
  @UseGuards(GqlAuthGuard)
  async updateReview(
    @GetCurrentUserId() userId: string,
    @Args('id') id: string,
    @Args('input') input: UpdateReviewInput,
  ) {
    return this.service.update(id, userId, input);
  }

  @Mutation(() => ReviewModel)
  @UseGuards(GqlAuthGuard)
  async deleteReview(@GetCurrentUserId() userId: string, @Args('id') id: string) {
    return this.service.remove(id, userId);
  }
}
