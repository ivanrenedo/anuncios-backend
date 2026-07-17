import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GqlExecutionContext } from '@nestjs/graphql';

/**
 * Requires a valid JWT *and* that the user has admin panel access
 * (`permission = GRANTED`). Protects admin-only operations.
 *
 * Works in both GraphQL and REST contexts: `getRequest` sniffs the
 * execution type so the same guard can decorate resolvers or controllers.
 */
@Injectable()
export class AdminGuard extends AuthGuard('jwt') {
  getRequest(context: ExecutionContext) {
    if (context.getType<'http' | 'graphql'>() === 'graphql') {
      return GqlExecutionContext.create(context).getContext().req;
    }
    return context.switchToHttp().getRequest();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const allowed = (await super.canActivate(context)) as boolean;
    if (!allowed) return false;
    const req = this.getRequest(context);
    if (req.user?.permission !== 'GRANTED') {
      throw new ForbiddenException('Requiere acceso de administrador');
    }
    if (!req.user?.rolId) {
      throw new ForbiddenException(
        'Requiere un rol asignado para acceder al panel',
      );
    }
    return true;
  }
}
