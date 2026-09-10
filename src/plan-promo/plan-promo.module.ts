import { Global, Module } from '@nestjs/common';
import { PlanPromoService } from './plan-promo.service';
import { PlanPromoResolver } from './plan-promo.resolver';

/**
 * Global so every plan-gated module (products, users, auth, QR scans) can
 * inject the promo state without adding an import edge to each of them.
 */
@Global()
@Module({
  providers: [PlanPromoService, PlanPromoResolver],
  exports: [PlanPromoService],
})
export class PlanPromoModule {}
