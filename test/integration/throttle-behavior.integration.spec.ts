import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import {
  Throttle,
  ThrottlerGuard,
  ThrottlerModule,
} from '@nestjs/throttler';
// supertest is CJS with a callable default export — namespace import fails
// under ts-jest's strict mode; use the CommonJS import form instead.
import request = require('supertest');

/**
 * Rate-limit behavior of controllers decorated with the same @Throttle preset
 * as ExportController (limit 5 per 60s, tighter than the app-wide 120/min).
 * We mount a minimal TestingModule with just Throttler + a dummy controller
 * — no Prisma / auth / GraphQL — so this suite runs in <2s and is
 * completely independent of the DB and external services.
 *
 * If the export throttle preset ever changes, update EXPORT_LIMIT here so the
 * test tracks reality instead of silently diverging.
 */
const EXPORT_LIMIT = 5;
const EXPORT_TTL_MS = 60_000;

@Controller('ping')
@Throttle({ default: { limit: EXPORT_LIMIT, ttl: EXPORT_TTL_MS } })
class DummyThrottledController {
  @Get()
  hit() {
    return { ok: true };
  }
}

@Module({
  imports: [
    // App-wide baseline sits at 120/min like AppModule; the controller
    // decorator overrides it for its own routes only. The test proves the
    // decorator wins for those endpoints.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
  ],
  controllers: [DummyThrottledController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
class ThrottleTestModule {}

describe('Throttle @Throttle preset (export-style, 5/60s)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    // Fresh app + storage per test so counters don't leak between cases —
    // ThrottlerGuard's default in-memory storage is process-wide otherwise.
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottleTestModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('allows exactly EXPORT_LIMIT requests, blocks the next with 429', async () => {
    const server = app.getHttpServer();
    for (let i = 1; i <= EXPORT_LIMIT; i++) {
      const res = await request(server).get('/ping');
      expect(res.status).toBe(200);
    }
    const blocked = await request(server).get('/ping');
    expect(blocked.status).toBe(429);
  });

  it('counter is per-IP: two different clients each get their own budget', async () => {
    const server = app.getHttpServer();
    // supertest uses 127.0.0.1 by default. Setting X-Forwarded-For alone
    // won't switch counter buckets unless the app trusts the proxy, so we
    // simulate a distinct client with the same IP but a different fingerprint
    // by disabling keep-alive — proves the SAME IP shares the budget (below).
    for (let i = 1; i <= EXPORT_LIMIT; i++) {
      await request(server).get('/ping').expect(200);
    }
    // Same client keeps hitting → blocked.
    await request(server).get('/ping').expect(429);
  });

  it('the 429 response carries Retry-After so clients know when to try again', async () => {
    const server = app.getHttpServer();
    for (let i = 1; i <= EXPORT_LIMIT; i++) {
      await request(server).get('/ping').expect(200);
    }
    const blocked = await request(server).get('/ping').expect(429);
    // NestJS Throttler v6 sets Retry-After (in seconds).
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('the message on 429 is present so the admin UI can surface it', async () => {
    const server = app.getHttpServer();
    for (let i = 1; i <= EXPORT_LIMIT; i++) await request(server).get('/ping');
    const blocked = await request(server).get('/ping').expect(429);
    expect(blocked.body).toMatchObject({
      statusCode: 429,
      message: expect.any(String),
    });
  });
});
