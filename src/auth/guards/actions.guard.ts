import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { PrismaService } from '../../prisma/prisma.service';

export const REQUIRED_ACTIONS = 'requiredActions';

/** Attach the permission verbs a mutation requires (create/read/update/delete). */
export const RequireActions = (...actions: string[]) =>
  SetMetadata(REQUIRED_ACTIONS, actions);

/** The top-of-hierarchy role: always allowed, regardless of its action list. */
const SUPER_ADMIN_LABEL = 'SUPER_ADMIN';

function normalizeLabel(label?: string | null) {
  return (label ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}

/**
 * Enforces role-based action permissions. Runs *after* AdminGuard (which sets
 * `req.user`). The acting user's role + actions are loaded fresh from the DB so
 * permission changes take effect immediately. Deny by default.
 */
@Injectable()
export class ActionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required =
      this.reflector.get<string[]>(REQUIRED_ACTIONS, context.getHandler()) ??
      [];
    if (required.length === 0) return true;

    const req = GqlExecutionContext.create(context).getContext().req;
    const userId = req?.user?.id;
    if (!userId) throw new ForbiddenException('No autorizado');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { rol: true },
    });

    const role = user?.rol;
    const isSuperAdmin = normalizeLabel(role?.label) === SUPER_ADMIN_LABEL;
    const actions: string[] = (role?.actions as string[]) ?? [];

    const allowed =
      isSuperAdmin || required.every((action) => actions.includes(action));
    if (!allowed) {
      throw new ForbiddenException('Tu rol no tiene permiso para esta acción');
    }
    return true;
  }
}
