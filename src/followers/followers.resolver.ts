import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { FollowersService } from './followers.service';
import { FollowerModel } from './dto/follower.model';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { GetCurrentUserId } from '../auth/decorators/current-user.decorator';

@Resolver(() => FollowerModel)
export class FollowersResolver {
  constructor(private service: FollowersService) {}

  @Query(() => [FollowerModel])
  async followers(@Args('userId') userId: string) {
    return this.service.getFollowers(userId);
  }

  @Query(() => [FollowerModel])
  async following(@Args('userId') userId: string) {
    return this.service.getFollowing(userId);
  }

  @Query(() => Boolean)
  @UseGuards(GqlAuthGuard)
  async isFollowing(
    @GetCurrentUserId() currentUserId: string,
    @Args('userId') userId: string,
  ) {
    return this.service.isFollowing(currentUserId, userId);
  }

  @Query(() => Int)
  async followersCount(@Args('userId') userId: string) {
    return this.service.followersCount(userId);
  }

  @Query(() => Int)
  async followingCount(@Args('userId') userId: string) {
    return this.service.followingCount(userId);
  }

  @Mutation(() => FollowerModel)
  @UseGuards(GqlAuthGuard)
  async followUser(
    @GetCurrentUserId() currentUserId: string,
    @Args('userId') userId: string,
  ) {
    return this.service.follow(currentUserId, userId);
  }

  @Mutation(() => FollowerModel)
  @UseGuards(GqlAuthGuard)
  async unfollowUser(
    @GetCurrentUserId() currentUserId: string,
    @Args('userId') userId: string,
  ) {
    return this.service.unfollow(currentUserId, userId);
  }
}
