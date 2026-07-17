import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AdminActionModel } from './dto/admin-action.model';
import { AdminGuard } from '../auth/guards/admin.guard';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';

@Resolver(() => AdminActionModel)
export class AuditResolver {
  constructor(private service: AuditService) {}

  @Query(() => [AdminActionModel])
  @UseGuards(AdminGuard)
  async adminActions(
    @Args('take', { type: () => Int, nullable: true }) take?: number,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
  ) {
    return this.service.findAll(take ?? 100, skip ?? 0);
  }

  /** Purge audit records. Restricted to SUPER_ADMIN to keep the trail honest. */
  @Mutation(() => Int)
  @UseGuards(AdminGuard, SuperAdminGuard)
  async deleteAdminActions(
    @Args({ name: 'ids', type: () => [String] }) ids: string[],
  ) {
    return this.service.deleteMany(ids);
  }
}
