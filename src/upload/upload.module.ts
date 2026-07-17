import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { StorageService } from './storage.service';
import { UploadCron } from './upload.cron';

@Module({
  controllers: [UploadController],
  providers: [StorageService, UploadCron],
  exports: [StorageService],
})
export class UploadModule {}
