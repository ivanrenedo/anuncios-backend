import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserInput } from './dto/update-user.input';
import { CreateUserInput } from './dto/create-user.input';
import { AdminUpdateUserInput } from './dto/admin-update-user.input';
import { ChangePlanInput } from './dto/change-plan.input';
import { ActivatePlanInput } from './dto/activate-plan.input';
import { hashPin } from '../common/pin.util';
import { DEFAULT_ROLE_LABEL } from '../common/defaults';
import {
  PLAN_CONCEPTS,
  PLAN_PRICES,
  PLAN_LIMITS,
  activePlan,
} from '../common/plan-limits';
import {
  calculatePlanTotal,
  warnIfCheaperAtTwelve,
  PlanTotalBreakdown,
  CheaperAtTwelveWarning,
} from '../common/pricing';
import { UserPlan } from './dto/user-plan.enum';
import { AuditService } from '../audit/audit.service';
import { NotificationEvents } from '../notifications/notifications.events';
import { StorageService } from '../upload/storage.service';
import {
  EmailEvents,
  PlanActivatedEvent,
  AccountSuspendedEvent,
} from '../email/email.events';

const SUPER_ADMIN_LABEL = 'SUPER_ADMIN';

function normalizeRoleLabel(label?: string | null) {
  return (label ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private events: EventEmitter2,
    private audit: AuditService,
    private storage: StorageService,
  ) {}

  /**
   * Public contact details for the business account (phone → WhatsApp, email).
   * Falls back to hardcoded defaults if the flagged user is missing or lacks
   * a phone, so mobile `Linking.openURL('https://wa.me/...')` never breaks.
   */
  async businessContact() {
    const user = await this.prisma.user.findFirst({
      where: { isBusiness: true },
      select: { phone: true, email: true },
    });
    return {
      phone: user?.phone?.trim() || '240222626418',
      email: user?.email?.trim() || 'digitalcorps365@gmail.com',
    };
  }

  async findAll(take = 500, skip = 0, query?: string) {
    const q = query?.trim();
    return this.prisma.user.findMany({
      where: q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  async create(input: CreateUserInput) {
    const { rolId, pin, ...rest } = input;
    const existing = await this.prisma.user.findUnique({
      where: { email: rest.email },
    });
    if (existing) {
      throw new ConflictException('Ya existe un usuario con ese email');
    }
    const data: any = {
      ...rest,
      // `pin` defaults to "246810" via the GraphQL schema; we only persist its hash.
      pin: hashPin(pin),
      // Default every new user to the "USER" role unless another is provided.
      rol: { connect: { id: rolId ?? (await this.defaultRoleId()) } },
    };
    return this.prisma.user.create({ data });
  }

  /** Id of the default "USER" role, created on first use if it doesn't exist. */
  private async defaultRoleId() {
    const role = await this.prisma.rol.upsert({
      where: { label: DEFAULT_ROLE_LABEL },
      update: {},
      create: {
        label: DEFAULT_ROLE_LABEL,
        description: 'Rol por defecto',
        actions: [],
      },
    });
    return role.id;
  }

  async update(id: string, data: UpdateUserInput) {
    const before = await this.prisma.user.findUnique({
      where: { id },
      select: { avatarUrl: true, coverUrl: true },
    });
    const updated = await this.prisma.user.update({ where: { id }, data });
    await this.cleanupReplacedUserImages(before, {
      avatarUrl: data.avatarUrl,
      coverUrl: data.coverUrl,
    });
    return updated;
  }

  /** Admin edit of any user by id (name, email, location, role, verified). */
  async adminUpdate(id: string, input: AdminUpdateUserInput, adminId?: string) {
    const before = await this.prisma.user.findUnique({
      where: { id },
      select: {
        rolId: true,
        permission: true,
        verified: true,
      },
    });

    const { rolId, pin, ...rest } = input;
    const data: any = { ...rest };
    if (rolId !== undefined) {
      data.rol = rolId ? { connect: { id: rolId } } : { disconnect: true };
    }
    const nextPin = typeof pin === 'string' ? pin.trim() : '';
    if (nextPin) {
      await this.ensureSuperAdmin(adminId);
      if (!/^\d{4,12}$/.test(nextPin)) {
        throw new BadRequestException('El PIN debe tener entre 4 y 12 dígitos');
      }
      data.pin = hashPin(nextPin);
    }
    const updated = await this.prisma.user.update({ where: { id }, data });

    // Verification badge granted → celebrate + inform.
    if (input.verified === true && !before?.verified) {
      this.events.emit(NotificationEvents.UserVerified, { userId: id });
    }

    // Role or admin permission changed → security heads-up (always fires,
    // ignoring notification preferences).
    const roleChanged =
      rolId !== undefined &&
      String(rolId ?? '') !== String(before?.rolId ?? '');
    const permChanged =
      input.permission !== undefined && input.permission !== before?.permission;
    if (roleChanged || permChanged) {
      const changes: string[] = [];
      if (roleChanged)
        changes.push(rolId ? 'se asignó un nuevo rol' : 'se removió tu rol');
      if (permChanged)
        changes.push(
          input.permission === 'GRANTED'
            ? 'se otorgó acceso al sistema'
            : 'se revocó el acceso al sistema',
        );
      this.events.emit(NotificationEvents.UserSecurity, {
        userId: id,
        summary: `Cambio de seguridad en tu cuenta: ${changes.join(' y ')}.`,
      });
    }

    if (data.pin) {
      this.audit.log(adminId, 'update_admin_pin', 'user', id, 'PIN admin actualizado');
    }

    return updated;
  }

  private async ensureSuperAdmin(adminId?: string) {
    if (!adminId) {
      throw new ForbiddenException('Solo un SUPER_ADMIN puede hacer esto');
    }
    const admin = await this.prisma.user.findUnique({
      where: { id: adminId },
      include: { rol: true },
    });
    if (normalizeRoleLabel(admin?.rol?.label) !== SUPER_ADMIN_LABEL) {
      throw new ForbiddenException('Solo un SUPER_ADMIN puede hacer esto');
    }
  }

  /** Delete a user and all of their dependent records, in one transaction. */
  async remove(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { avatarUrl: true, coverUrl: true },
    });
    const productImages = await this.prisma.productImage.findMany({
      where: { product: { sellerId: id } },
      select: { url: true },
    });

    const result = await this.prisma.$transaction(async (tx) => {
      const products = await tx.product.findMany({
        where: { sellerId: id },
        select: { id: true },
      });
      const productIds = products.map((p) => p.id);
      if (productIds.length) {
        await tx.favorite.deleteMany({
          where: { productId: { in: productIds } },
        });
        await tx.product.deleteMany({ where: { id: { in: productIds } } });
      }
      await tx.favorite.deleteMany({ where: { userId: id } });
      await tx.review.deleteMany({
        where: { OR: [{ authorId: id }, { sellerId: id }] },
      });
      await tx.follower.deleteMany({
        where: { OR: [{ followerId: id }, { followedId: id }] },
      });
      await tx.notification.deleteMany({ where: { userId: id } });
      // Keep roles this user created, just detach the creator reference.
      await tx.rol.updateMany({
        where: { createdById: id },
        data: { createdById: null },
      });
      return tx.user.delete({ where: { id } });
    });

    await this.storage.deleteFiles([
      user?.avatarUrl,
      user?.coverUrl,
      ...productImages.map((i) => i.url),
    ]);

    return result;
  }

  async findUserProducts(userId: string) {
    return this.prisma.product.findMany({
      where: { sellerId: userId },
      include: { images: true, category: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findUserReviews(userId: string) {
    return this.prisma.review.findMany({
      where: { sellerId: userId },
      include: { author: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findUserFollowers(userId: string) {
    return this.prisma.follower.findMany({
      where: { followedId: userId },
      include: { follower: true },
    });
  }

  async findUserFollowing(userId: string) {
    return this.prisma.follower.findMany({
      where: { followerId: userId },
      include: { followed: true },
    });
  }

  /**
   * Moderation ban: blocks every authenticated request (the JWT strategy
   * rejects `permission = DENIED`) and pulls the user's listings off the
   * marketplace. Their data stays intact for a possible unsuspension.
   */
  async suspendUser(id: string, reason?: string, adminId?: string) {
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        suspended: true,
        suspendedReason: reason ?? null,
        permission: 'DENIED',
      },
    });

    await this.prisma.product.updateMany({
      where: { sellerId: id, status: 'active' },
      data: { status: 'hide' },
    });

    // Notify by email. The dedupe key uses `updatedAt` so re-suspending after
    // an unsuspension fires a fresh email instead of being silenced.
    this.events.emit(EmailEvents.AccountSuspended, {
      userId: id,
      reason: reason?.trim() || undefined,
      suspendedAt: user.updatedAt,
    } as AccountSuspendedEvent);

    this.audit.log(adminId, 'suspend_user', 'user', id, reason ?? user.name);
    return user;
  }

  async unsuspendUser(id: string, adminId?: string) {
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        suspended: false,
        suspendedReason: null,
        permission: 'GRANTED',
      },
    });

    await this.prisma.product.updateMany({
      where: { sellerId: id, status: 'hide' },
      data: { status: 'active' },
    });

    this.audit.log(adminId, 'unsuspend_user', 'user', id, user.name);
    return user;
  }

  async changePlan(adminId: string, input: ChangePlanInput) {
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true, plan: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const [updated, planChange] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: input.userId },
        data: {
          plan: input.plan,
          planExpiresAt: input.expiresAt ?? null,
        },
      }),
      this.prisma.planChange.create({
        data: {
          userId: input.userId,
          oldPlan: user.plan,
          newPlan: input.plan,
          expiresAt: input.expiresAt ?? null,
          reason: input.reason,
          changedById: adminId,
        },
      }),
    ]);

    // Revenue ledger: paid plans are sold manually (WhatsApp), so activating
    // one here IS the payment record. Downgrades to FREE register nothing.
    if (input.plan !== 'FREE' && PLAN_PRICES[input.plan]) {
      await this.prisma.payment.create({
        data: {
          userId: input.userId,
          amount: PLAN_PRICES[input.plan],
          concept: PLAN_CONCEPTS[input.plan],
          note: input.reason ?? null,
          createdById: adminId,
        },
      });

      // Invoice email — only for paid plans; a FREE downgrade isn't a purchase.
      this.events.emit(EmailEvents.PlanActivated, {
        userId: input.userId,
        plan: input.plan,
        amount: Number(PLAN_PRICES[input.plan]),
        planChangeId: planChange.id,
        expiresAt: input.expiresAt ?? null,
      } as PlanActivatedEvent);
    }

    this.events.emit(NotificationEvents.UserSecurity, {
      userId: input.userId,
      summary: `Tu plan ha sido actualizado a ${input.plan}.`,
    });

    this.audit.log(
      adminId,
      'change_plan',
      'user',
      input.userId,
      `${user.plan} → ${input.plan}`,
    );

    return updated;
  }

  async planHistory(userId: string) {
    return this.prisma.planChange.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * v2 admin activation with multi-month duration and volume discount.
   *
   * Upgrade/renewal policy (see docs/plans-v2-decisions.md):
   *   - same plan, still active   → accumulate:    endsAt = planExpiresAt + months
   *   - same plan, expired        → replace:       endsAt = now + months
   *   - different plan (any state)→ replace:       endsAt = now + months
   *                                                (remaining time on old plan
   *                                                is lost — admin knows this)
   *
   * Writes atomically in one transaction:
   *   - User          (plan, planCycle, planStartedAt, planExpiresAt)
   *   - PlanActivation (full pricing breakdown, immutable sale record)
   *   - PlanChange     (existing lightweight audit log, kept for compat)
   *   - Payment        (revenue ledger — only when plan !== FREE)
   *
   * A single "period month" is normalised to 30 days: enough precision for a
   * manual-payment product where the admin sets `endsAt` visually.
   */
  async activatePlan(adminId: string, input: ActivatePlanInput) {
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: {
        id: true,
        plan: true,
        planExpiresAt: true,
        planStartedAt: true,
      },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    // Throws if months is out of [1,12] or plan is unknown.
    const breakdown = calculatePlanTotal(input.plan, input.months);
    const now = new Date();
    const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

    const samePlanRenewal = input.plan === user.plan;
    const stillActive = !!user.planExpiresAt && user.planExpiresAt > now;
    const startsAt = samePlanRenewal && stillActive ? user.planExpiresAt! : now;
    const endsAt = new Date(startsAt.getTime() + input.months * MONTH_MS);
    const newPlanStartedAt =
      samePlanRenewal && stillActive ? user.planStartedAt : now;
    const newCycle = input.months === 12 ? 'YEARLY' : 'MONTHLY';

    const [updatedUser, planActivation, planChange] =
      await this.prisma.$transaction(async (tx) => {
        const u = await tx.user.update({
          where: { id: input.userId },
          data: {
            plan: input.plan,
            planCycle: newCycle,
            planStartedAt: newPlanStartedAt,
            planExpiresAt: endsAt,
          },
        });
        const pa = await tx.planActivation.create({
          data: {
            userId: input.userId,
            plan: input.plan,
            months: input.months,
            unitPrice: breakdown.unitPrice,
            discountPct: breakdown.discountPct,
            totalPaid: breakdown.total,
            activatedByAdminId: adminId,
            startsAt,
            endsAt,
            notes: input.notes ?? null,
          },
        });
        const pc = await tx.planChange.create({
          data: {
            userId: input.userId,
            oldPlan: user.plan,
            newPlan: input.plan,
            expiresAt: endsAt,
            reason: input.notes ?? `${input.months}m via adminActivatePlan`,
            changedById: adminId,
          },
        });
        if (input.plan !== UserPlan.FREE && breakdown.total > 0) {
          await tx.payment.create({
            data: {
              userId: input.userId,
              amount: breakdown.total,
              concept: `plan_${input.plan.toLowerCase()}`,
              note: input.notes ?? `${input.months}m`,
              createdById: adminId,
            },
          });
        }
        return [u, pa, pc];
      });

    if (input.plan !== UserPlan.FREE && breakdown.total > 0) {
      this.events.emit(EmailEvents.PlanActivated, {
        userId: input.userId,
        plan: input.plan,
        amount: breakdown.total,
        planChangeId: planChange.id,
        expiresAt: endsAt,
      } as PlanActivatedEvent);
    }

    this.events.emit(NotificationEvents.UserSecurity, {
      userId: input.userId,
      summary: `Tu plan es ahora ${input.plan} por ${input.months} mes(es).`,
    });

    this.audit.log(
      adminId,
      'activate_plan',
      'user',
      input.userId,
      `${user.plan} → ${input.plan} × ${input.months}m (${breakdown.total} XAF)`,
    );

    return planActivation;
  }

  async planActivations(userId: string) {
    return this.prisma.planActivation.findMany({
      where: { userId },
      orderBy: { activatedAt: 'desc' },
    });
  }

  /**
   * v2 (Fase 5.1). Seller-driven mutation: replace the seller's pinned-in-
   * profile products with the supplied ordered list. Plan gates:
   *   - Free/Basic → forbidden (limit 0)
   *   - Star       → up to 4
   *   - Premium    → up to 10
   * Every id must belong to the caller and be active. The write clears the
   * previous pins and re-inserts one row per id with `position` = array index.
   */
  async setPinnedProducts(userId: string, productIds: string[]) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, plan: true, planExpiresAt: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const currentPlan = activePlan(user);
    const limit = PLAN_LIMITS[currentPlan].pinnedProducts;
    if (limit === 0) {
      throw new BadRequestException(
        'Tu plan actual no permite anuncios fijados. Sube a Estrella o Premium.',
      );
    }
    if (productIds.length > limit) {
      throw new BadRequestException(
        `Tu plan permite hasta ${limit} anuncios fijados (recibí ${productIds.length}).`,
      );
    }
    if (new Set(productIds).size !== productIds.length) {
      throw new BadRequestException('Los IDs de anuncios no pueden repetirse.');
    }

    if (productIds.length > 0) {
      const owned = await this.prisma.product.findMany({
        where: {
          id: { in: productIds },
          sellerId: userId,
          status: 'active',
        },
        select: { id: true },
      });
      if (owned.length !== productIds.length) {
        throw new BadRequestException(
          'Todos los anuncios fijados deben ser tuyos y estar activos.',
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.pinnedProduct.deleteMany({ where: { userId } });
      for (let i = 0; i < productIds.length; i++) {
        await tx.pinnedProduct.create({
          data: { userId, productId: productIds[i], position: i },
        });
      }
    });

    return this.pinnedProducts(userId);
  }

  async pinnedProducts(userId: string) {
    const pins = await this.prisma.pinnedProduct.findMany({
      where: { userId },
      orderBy: { position: 'asc' },
      include: {
        product: {
          include: {
            seller: true,
            category: { include: { parent: true } },
            images: { orderBy: { sortOrder: 'asc' } },
          },
        },
      },
    });
    return pins.map((p) => p.product);
  }

  /**
   * v2 (Fase 10d.1) — Aggregate stats for the admin dashboard. All numbers
   * are computed on the fly with a small handful of grouped queries; there
   * is no materialised view. Cheap enough for the current user count.
   */
  async planStats(monthsBack = 6) {
    const now = new Date();

    // Distribution — count users per plan. Users whose plan expired count as
    // FREE (matches the daily downgrade cron + activePlan() helper).
    const users = await this.prisma.user.findMany({
      select: { plan: true, planExpiresAt: true },
    });
    const counts: Record<string, number> = {
      FREE: 0,
      BASIC: 0,
      STAR: 0,
      PREMIUM: 0,
    };
    let activeMrr = 0;
    let expiringNext7d = 0;
    let churnedLast30d = 0;
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 86_400_000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);
    for (const u of users) {
      const effective = activePlan(u as { plan: string; planExpiresAt: Date | null });
      counts[effective] = (counts[effective] ?? 0) + 1;
      if (effective !== 'FREE') {
        activeMrr += Number(PLAN_PRICES[effective] ?? 0);
        if (
          u.planExpiresAt &&
          u.planExpiresAt > now &&
          u.planExpiresAt <= sevenDaysFromNow
        ) {
          expiringNext7d += 1;
        }
      } else if (
        u.plan !== 'FREE' &&
        u.planExpiresAt &&
        u.planExpiresAt <= now &&
        u.planExpiresAt >= thirtyDaysAgo
      ) {
        // Row still labelled as paid but its expiry already passed → churn.
        churnedLast30d += 1;
      }
    }

    // Activations by month for the last N months. Bucketed by activatedAt
    // UTC month; revenue is sum of totalPaid (already accounts for discount).
    const monthsAgo = new Date(now);
    monthsAgo.setUTCDate(1);
    monthsAgo.setUTCMonth(monthsAgo.getUTCMonth() - (monthsBack - 1));
    monthsAgo.setUTCHours(0, 0, 0, 0);
    const activations = await this.prisma.planActivation.findMany({
      where: { activatedAt: { gte: monthsAgo } },
      select: { activatedAt: true, totalPaid: true },
    });
    const buckets = new Map<string, { count: number; revenue: number }>();
    // Seed empty months so the chart doesn't have gaps.
    for (let i = 0; i < monthsBack; i++) {
      const d = new Date(monthsAgo);
      d.setUTCMonth(monthsAgo.getUTCMonth() + i);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      buckets.set(key, { count: 0, revenue: 0 });
    }
    for (const a of activations) {
      const key = `${a.activatedAt.getUTCFullYear()}-${String(a.activatedAt.getUTCMonth() + 1).padStart(2, '0')}`;
      const bucket = buckets.get(key) ?? { count: 0, revenue: 0 };
      bucket.count += 1;
      bucket.revenue += Number(a.totalPaid);
      buckets.set(key, bucket);
    }
    const activationsByMonth = Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, activations: v.count, revenue: v.revenue }));

    return {
      distribution: (Object.keys(counts) as UserPlan[]).map((plan) => ({
        plan,
        count: counts[plan] ?? 0,
      })),
      activeMrr,
      churnedLast30d,
      expiringNext7d,
      activationsByMonth,
    };
  }

  /**
   * Pure preview for the admin panel. No DB access, no side effects. The
   * frontend polls this while the admin drags the "months" selector to render
   * the breakdown and the 12-months hint in real time.
   */
  planTotalPreview(
    plan: UserPlan,
    months: number,
  ): PlanTotalBreakdown & { cheaperAtTwelve: CheaperAtTwelveWarning } {
    const breakdown = calculatePlanTotal(plan, months);
    const cheaperAtTwelve = warnIfCheaperAtTwelve(plan, months);
    return { ...breakdown, cheaperAtTwelve };
  }

  /**
   * SUPER_ADMIN purge of plan-history entries. Registers each affected user in
   * the audit log so the fact-of-deletion survives even when the detail no
   * longer does — a plain SUPER_ADMIN can wipe rows but can't hide the wipe.
   */
  async deletePlanChanges(ids: string[], adminId?: string) {
    if (!ids.length) return 0;
    const targets = await this.prisma.planChange.findMany({
      where: { id: { in: ids } },
      select: { id: true, userId: true },
    });
    const result = await this.prisma.planChange.deleteMany({
      where: { id: { in: ids } },
    });
    const perUser = new Map<string, number>();
    for (const t of targets) {
      perUser.set(t.userId, (perUser.get(t.userId) ?? 0) + 1);
    }
    for (const [userId, count] of perUser) {
      this.audit.log(
        adminId,
        'delete_plan_history',
        'user',
        userId,
        `${count} registro(s)`,
      );
    }
    return result.count;
  }

  /**
   * When a user swaps their avatar/cover, drop the old file from disk. Only
   * fires when the field was actually included in the input (`undefined` = not
   * touched) and its value differs from what was on the record.
   */
  private async cleanupReplacedUserImages(
    before: { avatarUrl: string | null; coverUrl: string | null } | null,
    next: { avatarUrl?: string | null; coverUrl?: string | null },
  ) {
    if (!before) return;
    const toDelete: (string | null)[] = [];
    if (next.avatarUrl !== undefined && next.avatarUrl !== before.avatarUrl) {
      toDelete.push(before.avatarUrl);
    }
    if (next.coverUrl !== undefined && next.coverUrl !== before.coverUrl) {
      toDelete.push(before.coverUrl);
    }
    if (toDelete.length) await this.storage.deleteFiles(toDelete);
  }
}
