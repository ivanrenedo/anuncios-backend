import { Resolver, Query, Mutation, Args, Int, ResolveField, Parent } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { UserModel } from './dto/user.model';
import { UserPlan } from './dto/user-plan.enum';
import { activePlan } from '../common/plan-limits';
import { UpdateUserInput } from './dto/update-user.input';
import { CreateUserInput } from './dto/create-user.input';
import { AdminUpdateUserInput } from './dto/admin-update-user.input';
import { ChangePlanInput } from './dto/change-plan.input';
import { PlanChangeModel } from './dto/plan-change.model';
import { BusinessContactModel } from './dto/business-contact.model';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { ActionsGuard, RequireActions } from '../auth/guards/actions.guard';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';
import { GetCurrentUserId } from '../auth/decorators/current-user.decorator';

@Resolver(() => UserModel)
export class UsersResolver {
  constructor(private usersService: UsersService) {}

  @ResolveField(() => UserPlan, { nullable: true })
  effectivePlan(@Parent() user: UserModel): UserPlan {
    return activePlan({
      plan: user.plan ?? UserPlan.FREE,
      planExpiresAt: user.planExpiresAt ?? null,
    });
  }

  @Query(() => [UserModel])
  @UseGuards(AdminGuard)
  async users(
    @Args('take', { type: () => Int, nullable: true }) take?: number,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('query', { nullable: true }) query?: string,
  ) {
    return this.usersService.findAll(take ?? 500, skip ?? 0, query);
  }

  @Query(() => UserModel)
  async user(@Args('id') id: string) {
    return this.usersService.findOne(id);
  }

  /** Public contact info for the business account (WhatsApp + email). */
  @Query(() => BusinessContactModel)
  async businessContact() {
    return this.usersService.businessContact();
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

  @Mutation(() => UserModel)
  @UseGuards(AdminGuard, ActionsGuard)
  @RequireActions('update')
  async suspendUser(
    @GetCurrentUserId() adminId: string,
    @Args('id') id: string,
    @Args('reason', { nullable: true }) reason?: string,
  ) {
    return this.usersService.suspendUser(id, reason, adminId);
  }

  @Mutation(() => UserModel)
  @UseGuards(AdminGuard, ActionsGuard)
  @RequireActions('update')
  async unsuspendUser(
    @GetCurrentUserId() adminId: string,
    @Args('id') id: string,
  ) {
    return this.usersService.unsuspendUser(id, adminId);
  }

  @Mutation(() => UserModel)
  @UseGuards(AdminGuard, ActionsGuard)
  @RequireActions('update')
  async changePlan(
    @GetCurrentUserId() adminId: string,
    @Args('input') input: ChangePlanInput,
  ) {
    return this.usersService.changePlan(adminId, input);
  }

  @Query(() => [PlanChangeModel])
  @UseGuards(AdminGuard)
  async planHistory(@Args('userId') userId: string) {
    return this.usersService.planHistory(userId);
  }

  @Mutation(() => Int)
  @UseGuards(AdminGuard, SuperAdminGuard)
  async deletePlanChanges(
    @GetCurrentUserId() adminId: string,
    @Args({ name: 'ids', type: () => [String] }) ids: string[],
  ) {
    return this.usersService.deletePlanChanges(ids, adminId);
  }
}
