import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserInput } from './dto/update-user.input';
import { CreateUserInput } from './dto/create-user.input';
import { AdminUpdateUserInput } from './dto/admin-update-user.input';
import { ChangePlanInput } from './dto/change-plan.input';
import { hashPin } from '../common/pin.util';
import { DEFAULT_ROLE_LABEL } from '../common/defaults';
import { PLAN_PRICES } from '../common/plan-limits';
import { AuditService } from '../audit/audit.service';
import { NotificationEvents } from '../notifications/notifications.events';
import { StorageService } from '../upload/storage.service';
import {
  EmailEvents,
  PlanActivatedEvent,
  AccountSuspendedEvent,
} from '../email/email.events';

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
  async adminUpdate(id: string, input: AdminUpdateUserInput) {
    const before = await this.prisma.user.findUnique({
      where: { id },
      select: {
        rolId: true,
        permission: true,
        verified: true,
      },
    });

    const { rolId, ...rest } = input;
    const data: any = { ...rest };
    if (rolId !== undefined) {
      data.rol = rolId ? { connect: { id: rolId } } : { disconnect: true };
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

    return updated;
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
          concept: input.plan === 'STAR' ? 'plan_star' : 'plan_premium',
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
