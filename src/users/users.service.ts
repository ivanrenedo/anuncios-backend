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
import { hashPin } from '../common/pin.util';
import { DEFAULT_ROLE_LABEL } from '../common/defaults';
import { NotificationEvents } from '../notifications/notifications.events';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private events: EventEmitter2,
  ) {}

  async findAll() {
    return this.prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
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
    return this.prisma.user.update({ where: { id }, data });
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
            ? 'se otorgó acceso al panel de administración'
            : 'se revocó el acceso al panel de administración',
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
    return this.prisma.$transaction(async (tx) => {
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
}
