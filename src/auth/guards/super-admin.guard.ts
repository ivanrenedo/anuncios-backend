import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { PrismaService } from '../../prisma/prisma.service';

const SUPER_ADMIN_LABEL = 'SUPER_ADMIN';

function normalizeLabel(label?: string | null) {
  return (label ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}

function getRequest(context: ExecutionContext) {
  if (context.getType<'http' | 'graphql'>() === 'graphql') {
    return GqlExecutionContext.create(context).getContext().req;
  }
  return context.switchToHttp().getRequest();
}

/**
 * Extra gate for the small set of operations reserved for SUPER_ADMIN only
 * (e.g. purging audit records, exporting payments). Must run after AdminGuard
 * so `req.user` is set; the role label is re-read from the DB so a demotion
 * takes effect immediately. Works in both GraphQL and REST contexts.
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = getRequest(context);
    const userId = req?.user?.id;
    if (!userId) throw new ForbiddenException('No autorizado');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { rol: true },
    });
    if (normalizeLabel(user?.rol?.label) !== SUPER_ADMIN_LABEL) {
      throw new ForbiddenException('Solo un SUPER_ADMIN puede hacer esto');
    }
    return true;
  }
}
