import { Module } from '@nestjs/common';
import { VerificationsService } from './verifications.service';
import { VerificationsResolver } from './verifications.resolver';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  providers: [VerificationsService, VerificationsResolver],
  exports: [VerificationsService],
})
export class VerificationsModule {}
