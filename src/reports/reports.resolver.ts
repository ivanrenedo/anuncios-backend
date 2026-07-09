import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportModel } from './dto/report.model';
import { CreateReportInput } from './dto/create-report.input';
import { ReportStatus } from './dto/report.enums';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { GetCurrentUserId } from '../auth/decorators/current-user.decorator';

@Resolver(() => ReportModel)
export class ReportsResolver {
  constructor(private service: ReportsService) {}

  /** Any logged-in user can report a product or another user. */
  @Mutation(() => ReportModel)
  @UseGuards(GqlAuthGuard)
  async createReport(
    @GetCurrentUserId() reporterId: string,
    @Args('input') input: CreateReportInput,
  ) {
    return this.service.create(reporterId, input);
  }

  /** Admin panel: list all reports (newest first). */
  @Query(() => [ReportModel])
  @UseGuards(AdminGuard)
  async reports() {
    return this.service.findAll();
  }

  /** Admin panel: mark a report as reviewed/dismissed/pending. */
  @Mutation(() => ReportModel)
  @UseGuards(AdminGuard)
  async updateReportStatus(
    @GetCurrentUserId() adminId: string,
    @Args('id') id: string,
    @Args('status', { type: () => ReportStatus }) status: ReportStatus,
    @Args('note', { nullable: true }) note?: string,
  ) {
    return this.service.updateStatus(id, status, adminId, note);
  }

  /** Admin panel: permanently delete one or more reports. Returns the count. */
  @Mutation(() => Int)
  @UseGuards(AdminGuard)
  async deleteReports(
    @Args('ids', { type: () => [String] }) ids: string[],
  ) {
    return this.service.deleteReports(ids);
  }
}
