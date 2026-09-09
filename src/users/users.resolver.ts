import { Resolver, Query, Mutation, Args, Int, ResolveField, Parent } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { UserModel } from './dto/user.model';
import { UserPlan } from './dto/user-plan.enum';
import { activePlan, entitlementPlan } from '../common/plan-limits';
import { PlanPromoService } from '../plan-promo/plan-promo.service';
import { UpdateUserInput } from './dto/update-user.input';
import { CreateUserInput } from './dto/create-user.input';
import { AdminUpdateUserInput } from './dto/admin-update-user.input';
import { ChangePlanInput } from './dto/change-plan.input';
import { ActivatePlanInput } from './dto/activate-plan.input';
import { PlanChangeModel } from './dto/plan-change.model';
import {
  PlanActivationModel,
  PlanTotalPreviewModel,
} from './dto/plan-activation.model';
import { PlanStatsModel } from './dto/plan-stats.model';
import { ProductModel } from '../products/models/product.model';
import { BusinessContactModel } from './dto/business-contact.model';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { ActionsGuard, RequireActions } from '../auth/guards/actions.guard';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';
import { GetCurrentUserId } from '../auth/decorators/current-user.decorator';

@Resolver(() => UserModel)
export class UsersResolver {
  constructor(
    private usersService: UsersService,
    private promo: PlanPromoService,
  ) {}

  /**
   * Plan the user actually pays for, expiry applied. Drives badges, so it is
   * deliberately *not* widened by the promotional period.
   */
  @ResolveField(() => UserPlan, { nullable: true })
  effectivePlan(@Parent() user: UserModel): UserPlan {
    return activePlan({
      plan: user.plan ?? UserPlan.FREE,
      planExpiresAt: user.planExpiresAt ?? null,
    });
  }

  /**
   * Plan whose *features* are in force: `effectivePlan` widened by whatever
   * the platform promo unlocks. Clients gate capabilities on this one.
   */
  @ResolveField(() => UserPlan, { nullable: true })
  async entitlementPlan(@Parent() user: UserModel): Promise<UserPlan> {
    return entitlementPlan(
      {
        plan: user.plan ?? UserPlan.FREE,
        planExpiresAt: user.planExpiresAt ?? null,
      },
      await this.promo.state(),
    );
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
    @GetCurrentUserId() adminId: string,
    @Args('id') id: string,
    @Args('input') input: AdminUpdateUserInput,
  ) {
    return this.usersService.adminUpdate(id, input, adminId);
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

  /**
   * v2 admin activation with multi-month duration + volume discount. Replaces
   * `changePlan` for the new admin panel flow (Fase 8). `changePlan` is kept
   * available for legacy calls until the panel migration is complete.
   */
  @Mutation(() => PlanActivationModel)
  @UseGuards(AdminGuard, ActionsGuard)
  @RequireActions('update')
  async adminActivatePlan(
    @GetCurrentUserId() adminId: string,
    @Args('input') input: ActivatePlanInput,
  ) {
    return this.usersService.activatePlan(adminId, input);
  }

  @Query(() => [PlanActivationModel])
  @UseGuards(AdminGuard)
  async planActivations(@Args('userId') userId: string) {
    return this.usersService.planActivations(userId);
  }

  /**
   * v2 (Fase 5.1). Set the seller's pinned-in-profile products in order.
   * Passing an empty array clears the pin list. Gated by plan
   * (Free/Basic 0, Star 4, Premium 10). Products must belong to the caller.
   */
  @Mutation(() => [ProductModel])
  @UseGuards(GqlAuthGuard)
  async setPinnedProducts(
    @GetCurrentUserId() userId: string,
    @Args({ name: 'productIds', type: () => [String] }) productIds: string[],
  ) {
    return this.usersService.setPinnedProducts(userId, productIds);
  }

  @Query(() => [ProductModel])
  async pinnedProducts(@Args('userId') userId: string) {
    return this.usersService.pinnedProducts(userId);
  }

  /**
   * v2 (Fase 10d) — Aggregate stats for the admin dashboard: distribution,
   * MRR, churn de últimos 30d, expiring en próximos 7d, y activations por
   * mes (últimos N meses, default 6).
   */
  @Query(() => PlanStatsModel)
  @UseGuards(AdminGuard)
  async adminPlanStats(
    @Args('monthsBack', { type: () => Int, nullable: true })
    monthsBack?: number,
  ) {
    return this.usersService.planStats(monthsBack ?? 6);
  }

  /**
   * Pure preview for the admin panel — no DB write. Returns the breakdown
   * (unitPrice / gross / discount / total) and the 12-months warning so the
   * UI can render the desglose in real time while the admin drags the picker.
   */
  @Query(() => PlanTotalPreviewModel)
  @UseGuards(AdminGuard)
  planTotalPreview(
    @Args('plan', { type: () => UserPlan }) plan: UserPlan,
    @Args('months', { type: () => Int }) months: number,
  ) {
    return this.usersService.planTotalPreview(plan, months);
  }
}
