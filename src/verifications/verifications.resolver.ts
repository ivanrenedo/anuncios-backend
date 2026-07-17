import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { VerificationsService } from './verifications.service';
import { VerificationModel } from './dto/verification.model';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { GetCurrentUserId } from '../auth/decorators/current-user.decorator';

@Resolver(() => VerificationModel)
export class VerificationsResolver {
  constructor(private service: VerificationsService) {}

  @Mutation(() => VerificationModel)
  @UseGuards(GqlAuthGuard)
  async requestVerification(@GetCurrentUserId() userId: string) {
    return this.service.requestVerification(userId);
  }

  @Query(() => VerificationModel, { nullable: true })
  @UseGuards(GqlAuthGuard)
  async myVerificationRequest(@GetCurrentUserId() userId: string) {
    return this.service.findByUser(userId);
  }

  @Query(() => [VerificationModel])
  @UseGuards(AdminGuard)
  async verificationRequests() {
    return this.service.findAll();
  }

  @Mutation(() => VerificationModel)
  @UseGuards(AdminGuard)
  async approveVerification(
    @GetCurrentUserId() adminId: string,
    @Args('id') id: string,
  ) {
    return this.service.approve(id, adminId);
  }

  @Mutation(() => VerificationModel)
  @UseGuards(AdminGuard)
  async rejectVerification(
    @GetCurrentUserId() adminId: string,
    @Args('id') id: string,
    @Args('reason', { nullable: true }) reason?: string,
  ) {
    return this.service.reject(id, adminId, reason);
  }

  @Mutation(() => Boolean)
  @UseGuards(AdminGuard)
  async deleteVerificationRequests(
    @Args('ids', { type: () => [String] }) ids: string[],
  ) {
    await this.service.deleteMany(ids);
    return true;
  }
}
