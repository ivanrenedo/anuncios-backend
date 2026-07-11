import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditResolver } from './audit.resolver';

/** Global so any domain module can inject AuditService without importing. */
@Global()
@Module({
  providers: [AuditService, AuditResolver],
  exports: [AuditService],
})
export class AuditModule {}
