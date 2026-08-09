import { Module } from '@nestjs/common';
import { HomeSectionsService } from './home-sections.service';
import { HomeSectionsResolver } from './home-sections.resolver';
import { StatsAnalyzerService } from './stats-analyzer.service';
import { PremiumCarouselCron } from './premium-carousel.cron';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  providers: [
    HomeSectionsService,
    HomeSectionsResolver,
    StatsAnalyzerService,
    PremiumCarouselCron,
  ],
  exports: [HomeSectionsService, StatsAnalyzerService],
})
export class HomeSectionsModule {}
