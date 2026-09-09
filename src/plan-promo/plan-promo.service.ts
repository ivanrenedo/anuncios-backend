import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UserPlan } from '../users/dto/user-plan.enum';
import {
  PLAN_LIMITS,
  PromoState,
  activePlan,
  effectiveLimits,
  entitlementPlan,
  hasStatsAccess,
} from '../common/plan-limits';
import { UpdatePlanPromoInput } from './dto/update-plan-promo.input';

/** Fixed primary key of the singleton row. */
const SINGLETON_ID = 'singleton';

/**
 * The promo row is read on nearly every plan-gated request (publishing,
 * boosting, loading a profile), so it is cached in memory. Only the row is
 * cached — `active` is recomputed against the clock on every read, so a promo
 * whose `endsAt` passes stops applying immediately without waiting for the TTL.
 */
const CACHE_TTL_MS = 30_000;

type PromoRow = {
  enabled: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  grantedPlan: string;
  unlockLimits: boolean;
  unlockPinned: boolean;
  unlockAutoBump: boolean;
  unlockStats: boolean;
  freeBoosts: boolean;
  bannerText: string | null;
  updatedAt: Date | null;
};

/** Used when the table isn't reachable yet: behaves as "no promo". */
const DISABLED_ROW: PromoRow = {
  enabled: false,
  startsAt: null,
  endsAt: null,
  grantedPlan: UserPlan.PREMIUM,
  unlockLimits: true,
  unlockPinned: true,
  unlockAutoBump: true,
  unlockStats: true,
  freeBoosts: true,
  bannerText: null,
  updatedAt: null,
};

/**
 * Platform-wide promotional override of the plan gates. While it runs, every
 * seller is entitled to the features of `grantedPlan` and the paid modules the
 * admin unlocked behave as free — without touching anyone's stored plan, so
 * badges, the ledger and the premium carousel keep reflecting what was paid.
 */
@Injectable()
export class PlanPromoService {
  private readonly logger = new Logger(PlanPromoService.name);
  private cache: { row: PromoRow; at: number } | null = null;

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /** Raw row, creating the singleton on first use. Cached for CACHE_TTL_MS. */
  private async row(): Promise<PromoRow> {
    if (this.cache && Date.now() - this.cache.at < CACHE_TTL_MS) {
      return this.cache.row;
    }
    try {
      const row = await this.prisma.planPromo.upsert({
        where: { id: SINGLETON_ID },
        update: {},
        create: { id: SINGLETON_ID },
      });
      this.cache = { row, at: Date.now() };
      return row;
    } catch (e: any) {
      // A promo lookup must never take the site down: if the table is missing
      // (migration not applied yet) fall back to "no promo" and keep serving.
      this.logger.warn(`plan promo unavailable, assuming off: ${e.message}`);
      const row = { ...DISABLED_ROW };
      this.cache = { row, at: Date.now() };
      return row;
    }
  }

  /** Drop the cache so the next read sees a just-written change. */
  private invalidate() {
    this.cache = null;
  }

  private static isWithinWindow(row: PromoRow, now: Date): boolean {
    if (!row.enabled) return false;
    if (row.startsAt && row.startsAt > now) return false;
    if (row.endsAt && row.endsAt <= now) return false;
    return true;
  }

  /**
   * Resolved promo as the enforcement code consumes it. This is the only
   * method the rest of the backend needs.
   */
  async state(now = new Date()): Promise<PromoState> {
    const row = await this.row();
    return {
      active: PlanPromoService.isWithinWindow(row, now),
      grantedPlan: row.grantedPlan as UserPlan,
      unlockLimits: row.unlockLimits,
      unlockPinned: row.unlockPinned,
      unlockAutoBump: row.unlockAutoBump,
      unlockStats: row.unlockStats,
      freeBoosts: row.freeBoosts,
      endsAt: row.endsAt,
    };
  }

  /** Admin view: the stored configuration plus its resolved `active` flag. */
  async config(now = new Date()) {
    const row = await this.row();
    return { ...row, active: PlanPromoService.isWithinWindow(row, now) };
  }

  /** Storefront view: nothing an anonymous visitor shouldn't see. */
  async publicConfig(now = new Date()) {
    const row = await this.row();
    const active = PlanPromoService.isWithinWindow(row, now);
    return {
      active,
      endsAt: active ? row.endsAt : null,
      grantedPlan: active ? (row.grantedPlan as UserPlan) : null,
      bannerText: active ? row.bannerText : null,
      unlockLimits: active && row.unlockLimits,
      unlockPinned: active && row.unlockPinned,
      unlockAutoBump: active && row.unlockAutoBump,
      unlockStats: active && row.unlockStats,
      freeBoosts: active && row.freeBoosts,
    };
  }

  /**
   * Apply a partial change from the admin panel. Every write is audited with a
   * readable diff — turning the whole platform free is exactly the kind of
   * action that has to be traceable to an admin afterwards.
   */
  async update(adminId: string | undefined, input: UpdatePlanPromoInput) {
    const before = await this.row();

    const startsAt =
      input.startsAt !== undefined ? input.startsAt : before.startsAt;
    const endsAt = input.endsAt !== undefined ? input.endsAt : before.endsAt;
    if (startsAt && endsAt && endsAt <= startsAt) {
      throw new BadRequestException(
        'La fecha de fin debe ser posterior a la de inicio.',
      );
    }

    const data = {
      ...(input.enabled !== undefined && { enabled: input.enabled }),
      ...(input.startsAt !== undefined && { startsAt: input.startsAt }),
      ...(input.endsAt !== undefined && { endsAt: input.endsAt }),
      ...(input.grantedPlan !== undefined && {
        grantedPlan: input.grantedPlan,
      }),
      ...(input.unlockLimits !== undefined && {
        unlockLimits: input.unlockLimits,
      }),
      ...(input.unlockPinned !== undefined && {
        unlockPinned: input.unlockPinned,
      }),
      ...(input.unlockAutoBump !== undefined && {
        unlockAutoBump: input.unlockAutoBump,
      }),
      ...(input.unlockStats !== undefined && {
        unlockStats: input.unlockStats,
      }),
      ...(input.freeBoosts !== undefined && { freeBoosts: input.freeBoosts }),
      ...(input.bannerText !== undefined && {
        bannerText: input.bannerText?.trim() || null,
      }),
      updatedById: adminId ?? null,
    };

    const after = await this.prisma.planPromo.upsert({
      where: { id: SINGLETON_ID },
      update: data,
      create: { id: SINGLETON_ID, ...data },
    });
    this.invalidate();

    const changes = Object.keys(data)
      .filter((k) => k !== 'updatedById')
      .map(
        (k) =>
          `${k}: ${fmtValue((before as any)[k])} → ${fmtValue((after as any)[k])}`,
      )
      .join(', ');
    this.audit.log(
      adminId,
      after.enabled ? 'promo_update_enabled' : 'promo_update_disabled',
      'system',
      SINGLETON_ID,
      changes || 'sin cambios',
    );

    return {
      ...after,
      active: PlanPromoService.isWithinWindow(after, new Date()),
    };
  }

  /**
   * Everything a seller may do right now: their paid plan widened by the
   * promo. Backs the `myEntitlements` query the clients gate their UI on.
   */
  async entitlementsFor(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true, planExpiresAt: true },
    });
    return this.buildEntitlements(user);
  }

  /** Anonymous fallback: the FREE tier with the promo folded in. */
  async anonymousEntitlements() {
    return this.buildEntitlements(null);
  }

  private async buildEntitlements(
    user: { plan: string; planExpiresAt: Date | null } | null,
  ) {
    const promo = await this.state();
    const paid = activePlan(user);
    const limits = effectiveLimits(paid, promo);

    return {
      plan: paid,
      entitlementPlan: entitlementPlan(user, promo),
      promoActive: promo.active,
      promoEndsAt: promo.active ? promo.endsAt : null,
      maxActiveProducts: limits.maxActiveProducts,
      maxImagesPerProduct: limits.maxImagesPerProduct,
      pinnedProducts: limits.pinnedProducts,
      autoBumpSlots: limits.autoBumpSlots,
      autoBumpCadence: limits.autoBumpCadence,
      includedBoostsPerMonth: limits.includedBoostsPerMonth,
      extraBoostDiscountPct: limits.extraBoostDiscountPct,
      hasStats: hasStatsAccess(paid, promo),
      freeBoosts: promo.active && promo.freeBoosts,
    };
  }

  /** Admin preview: what a FREE seller gets while the promo runs, vs. normally. */
  async previewLimits() {
    const promo = await this.state();
    return {
      free: PLAN_LIMITS[UserPlan.FREE],
      granted: effectiveLimits(UserPlan.FREE, promo),
    };
  }
}

function fmtValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (value instanceof Date) return value.toISOString().slice(0, 16);
  return String(value);
}
