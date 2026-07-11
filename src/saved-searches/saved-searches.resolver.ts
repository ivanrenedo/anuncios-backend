import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { SavedSearchesService } from './saved-searches.service';
import { SavedSearchModel, SearchTermStatModel } from './dto/saved-search.model';
import { CreateSavedSearchInput } from './dto/create-saved-search.input';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { GetCurrentUserId } from '../auth/decorators/current-user.decorator';

@Resolver(() => SavedSearchModel)
export class SavedSearchesResolver {
  constructor(private service: SavedSearchesService) {}

  @Query(() => [SavedSearchModel])
  @UseGuards(GqlAuthGuard)
  async mySavedSearches(@GetCurrentUserId() userId: string) {
    return this.service.findByUser(userId);
  }

  /** Most-saved search terms — admin demand signal. */
  @Query(() => [SearchTermStatModel])
  @UseGuards(AdminGuard)
  async savedSearchStats(
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
  ) {
    return this.service.termStats(limit ?? 20);
  }

  @Mutation(() => SavedSearchModel)
  @UseGuards(GqlAuthGuard)
  async createSavedSearch(
    @GetCurrentUserId() userId: string,
    @Args('input') input: CreateSavedSearchInput,
  ) {
    return this.service.create(userId, input);
  }

  @Mutation(() => SavedSearchModel)
  @UseGuards(GqlAuthGuard)
  async deleteSavedSearch(
    @GetCurrentUserId() userId: string,
    @Args('id') id: string,
  ) {
    return this.service.remove(userId, id);
  }
}
