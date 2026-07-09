import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { UserModel } from './dto/user.model';
import { UpdateUserInput } from './dto/update-user.input';
import { CreateUserInput } from './dto/create-user.input';
import { AdminUpdateUserInput } from './dto/admin-update-user.input';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { ActionsGuard, RequireActions } from '../auth/guards/actions.guard';
import { GetCurrentUserId } from '../auth/decorators/current-user.decorator';

@Resolver(() => UserModel)
export class UsersResolver {
  constructor(private usersService: UsersService) {}

  @Query(() => [UserModel])
  @UseGuards(AdminGuard)
  async users() {
    return this.usersService.findAll();
  }

  @Query(() => UserModel)
  async user(@Args('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Mutation(() => UserModel)
  @UseGuards(AdminGuard, ActionsGuard)
  @RequireActions('create')
  async createUser(@Args('input') input: CreateUserInput) {
    return this.usersService.create(input);
  }

  @Mutation(() => UserModel)
  @UseGuards(GqlAuthGuard)
  async updateUser(
    @GetCurrentUserId() userId: string,
    @Args('input') input: UpdateUserInput,
  ) {
    return this.usersService.update(userId, input);
  }

  @Mutation(() => UserModel)
  @UseGuards(AdminGuard, ActionsGuard)
  @RequireActions('update')
  async adminUpdateUser(
    @Args('id') id: string,
    @Args('input') input: AdminUpdateUserInput,
  ) {
    return this.usersService.adminUpdate(id, input);
  }

  @Mutation(() => UserModel)
  @UseGuards(AdminGuard, ActionsGuard)
  @RequireActions('delete')
  async deleteUser(@Args('id') id: string) {
    return this.usersService.remove(id);
  }

  @Mutation(() => UserModel)
  @UseGuards(GqlAuthGuard)
  async deleteMyAccount(@GetCurrentUserId() userId: string) {
    return this.usersService.remove(userId);
  }
}
