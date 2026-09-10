import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { PlanPromoService } from './plan-promo.service';
import {
  MyEntitlementsModel,
  PlanPromoModel,
  PublicPlanPromoModel,
} from './dto/plan-promo.model';
import { UpdatePlanPromoInput } from './dto/update-plan-promo.input';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { ActionsGuard, RequireActions } from '../auth/guards/actions.guard';
import { GetCurrentUserId } from '../auth/decorators/current-user.decorator';

@Resolver()
export class PlanPromoResolver {
  constructor(private service: PlanPromoService) {}

  /** Banner data for the storefront and the app. Public on purpose. */
  @Query(() => PublicPlanPromoModel)
  async planPromo() {
    return this.service.publicConfig();
  }

  /** Full configuration, including a promo scheduled but not yet started. */
  @Query(() => PlanPromoModel)
  @UseGuards(AdminGuard)
  async adminPlanPromo() {
    return this.service.config();
  }

  /**
   * What the caller may actually do right now. Clients gate their UI on this
   * instead of comparing plan strings, so a partial promo renders correctly.
   */
  @Query(() => MyEntitlementsModel)
  @UseGuards(GqlAuthGuard)
  async myEntitlements(@GetCurrentUserId() userId: string) {
    return this.service.entitlementsFor(userId);
  }

  @Mutation(() => PlanPromoModel)
  @UseGuards(AdminGuard, ActionsGuard)
  @RequireActions('update')
  async updatePlanPromo(
    @GetCurrentUserId() adminId: string,
    @Args('input') input: UpdatePlanPromoInput,
  ) {
    return this.service.update(adminId, input);
  }
}
