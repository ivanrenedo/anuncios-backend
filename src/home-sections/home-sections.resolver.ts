import { Resolver, Query, Mutation, Args, Int, Float } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { GraphQLJSON } from 'graphql-type-json';
import { HomeSectionsService } from './home-sections.service';
import { StatsAnalyzerService } from './stats-analyzer.service';
import {
  HomeSectionModel,
  HomeSuggestionModel,
  HomeSectionStats,
} from './dto/home-section.model';
import {
  CreateHomeSectionInput,
  UpdateHomeSectionInput,
} from './dto/create-home-section.input';
import { ProductModel } from '../products/models/product.model';
import { AdminGuard } from '../auth/guards/admin.guard';
import { GetCurrentUserId } from '../auth/decorators/current-user.decorator';

@Resolver(() => HomeSectionModel)
export class HomeSectionsResolver {
  constructor(
    private service: HomeSectionsService,
    private statsAnalyzer: StatsAnalyzerService,
  ) {}

  @Query(() => [HomeSectionModel])
  async homeSections(
    @Args('viewerKey', { nullable: true }) viewerKey?: string,
  ) {
    return this.service.findPublic(viewerKey);
  }

  @Query(() => [HomeSectionModel])
  @UseGuards(AdminGuard)
  async adminHomeSections() {
    return this.service.findAllAdmin();
  }

  @Query(() => [HomeSuggestionModel])
  @UseGuards(AdminGuard)
  async homeSuggestions() {
    return this.service.findSuggestions();
  }

  @Query(() => Int)
  @UseGuards(AdminGuard)
  async previewFilterCount(
    @Args('filter', { type: () => GraphQLJSON }) filter: any,
  ) {
    return this.service.previewFilterCount(filter);
  }

  @Query(() => [HomeSectionStats])
  @UseGuards(AdminGuard)
  async homeSectionStats() {
    return this.service.getStats();
  }

  @Mutation(() => HomeSectionModel)
  @UseGuards(AdminGuard)
  async createHomeSection(
    @GetCurrentUserId() adminId: string,
    @Args('input') input: CreateHomeSectionInput,
  ) {
    return this.service.create(input, adminId);
  }

  @Mutation(() => HomeSectionModel)
  @UseGuards(AdminGuard)
  async updateHomeSection(
    @Args('id') id: string,
    @Args('input') input: UpdateHomeSectionInput,
  ) {
    return this.service.update(id, input);
  }

  @Mutation(() => Boolean)
  @UseGuards(AdminGuard)
  async deleteHomeSection(@Args('id') id: string) {
    return this.service.delete(id);
  }

  @Mutation(() => [HomeSectionModel])
  @UseGuards(AdminGuard)
  async reorderHomeSections(
    @Args('ids', { type: () => [String] }) ids: string[],
  ) {
    return this.service.reorder(ids);
  }

  @Mutation(() => HomeSectionModel)
  @UseGuards(AdminGuard)
  async acceptHomeSuggestion(
    @GetCurrentUserId() adminId: string,
    @Args('id') id: string,
  ) {
    return this.service.acceptSuggestion(id, adminId);
  }

  @Mutation(() => HomeSuggestionModel)
  @UseGuards(AdminGuard)
  async dismissHomeSuggestion(
    @GetCurrentUserId() adminId: string,
    @Args('id') id: string,
  ) {
    return this.service.dismissSuggestion(id, adminId);
  }

  @Mutation(() => Int)
  @UseGuards(AdminGuard)
  async runStatsAnalyzer() {
    return this.statsAnalyzer.generateSuggestions();
  }

  @Query(() => [ProductModel])
  async sectionProducts(
    @Args('sectionId') sectionId: string,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
  ) {
    return this.service.getSectionProducts(sectionId, take, skip);
  }

  @Query(() => [HomeSectionModel])
  async filterableSections() {
    return this.service.findFilterable();
  }

  @Mutation(() => Boolean)
  async trackHomeSectionEvent(
    @Args('sectionId') sectionId: string,
    @Args('event') event: string,
    @Args('viewerKey') viewerKey: string,
  ) {
    return this.service.trackEvent(sectionId, event, viewerKey);
  }
}
