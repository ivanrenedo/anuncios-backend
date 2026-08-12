import { Module } from '@nestjs/common';
import { SellerQrScansService } from './seller-qr-scans.service';
import { SellerQrScansResolver } from './seller-qr-scans.resolver';

@Module({
  providers: [SellerQrScansService, SellerQrScansResolver],
  exports: [SellerQrScansService],
})
export class SellerQrScansModule {}
