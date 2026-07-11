import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsResolver } from './products.resolver';
import { ProductsController } from './products.controller';
import { ProductsCron } from './products.cron';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [ProductsController],
  providers: [ProductsService, ProductsResolver, ProductsCron],
  exports: [ProductsService],
})
export class ProductsModule {}
