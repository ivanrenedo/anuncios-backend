import {
  Resolver,
  Query,
  Mutation,
  Args,
  ObjectType,
  Field,
} from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { FavoritesService } from './favorites.service';
import { FavoriteModel } from './dto/favorite.model';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { GetCurrentUserId } from '../auth/decorators/current-user.decorator';

@ObjectType()
class ToggleFavoriteResponse {
  @Field()
  added: boolean;
}

@Resolver(() => FavoriteModel)
export class FavoritesResolver {
  constructor(private service: FavoritesService) {}

  @Query(() => [FavoriteModel])
  @UseGuards(GqlAuthGuard)
  async myFavorites(@GetCurrentUserId() userId: string) {
    return this.service.findByUser(userId);
  }

  @Query(() => [FavoriteModel])
  @UseGuards(AdminGuard)
  async favoritesByUser(@Args('userId') userId: string) {
    return this.service.findByUser(userId);
  }

  @Query(() => Boolean)
  @UseGuards(GqlAuthGuard)
  async isFavorited(
    @GetCurrentUserId() userId: string,
    @Args('productId') productId: string,
  ) {
    return this.service.isFavorited(userId, productId);
  }

  @Mutation(() => ToggleFavoriteResponse)
  @UseGuards(GqlAuthGuard)
  async toggleFavorite(
    @GetCurrentUserId() userId: string,
    @Args('productId') productId: string,
  ) {
    return this.service.toggle(userId, productId);
  }
}
