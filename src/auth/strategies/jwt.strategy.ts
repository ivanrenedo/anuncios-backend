import { ForbiddenException, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUser } from '../decorators/current-user.decorator';

/**
 * Throttles `lastSeenAt` writes: at most one UPDATE per user per hour.
 * The map is intentionally in-memory (per-process) — a redis-backed dedupe
 * would be more precise across instances but the DB write is cheap and a
 * few extra writes per user per hour on multi-instance rollouts is fine.
 */
const LAST_SEEN_THROTTLE_MS = 60 * 60 * 1000; // 1 hour
const lastSeenCache = new Map<string, number>();

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get<string>('JWT_SECRET') || 'fallback-secret',
    });
  }

  async validate(payload: { sub: string }): Promise<CurrentUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user) return null;
    // Global gate: a suspended account can't use any authenticated endpoint,
    // even with a still-valid token issued before the ban.
    if (user.permission === 'DENIED') {
      throw new ForbiddenException('Tu cuenta ha sido suspendida');
    }

    this.touchLastSeen(user.id);

    return {
      id: user.id,
      email: user.email,
      permission: user.permission,
      rolId: user.rolId,
    };
  }

  /** Fire-and-forget update of `lastSeenAt`, throttled. Used by the comeback
   *  cron to identify dormant users. Failures are swallowed — a missed touch
   *  is harmless and we never want to block the request path on it. */
  private touchLastSeen(userId: string) {
    const now = Date.now();
    const last = lastSeenCache.get(userId) ?? 0;
    if (now - last < LAST_SEEN_THROTTLE_MS) return;
    lastSeenCache.set(userId, now);
    this.prisma.user
      .update({ where: { id: userId }, data: { lastSeenAt: new Date(now) } })
      .catch(() => {
        // Drop the cache entry so we retry on the next request.
        lastSeenCache.delete(userId);
      });
  }
}
