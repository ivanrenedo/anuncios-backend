import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Liveness/readiness probe consumed by Docker's HEALTHCHECK. Failing here
 * (500) marks the container `unhealthy` so orchestrators can restart it —
 * important because `restart: unless-stopped` only catches hard crashes, not
 * hangs or lost DB connectivity.
 */
@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async check() {
    // Round-trip to Postgres proves the pool is alive and the app can query.
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', ts: new Date().toISOString() };
  }
}
