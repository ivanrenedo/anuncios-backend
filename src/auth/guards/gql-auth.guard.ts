import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GqlExecutionContext } from '@nestjs/graphql';
import { GraphQLError } from 'graphql';

@Injectable()
export class GqlAuthGuard extends AuthGuard('jwt') {
  getRequest(context: ExecutionContext) {
    const ctx = GqlExecutionContext.create(context);
    return ctx.getContext().req;
  }

  /**
   * Convert Passport's default "Unauthorized" HTTP exception into a
   * GraphQL-native error with `extensions.code = 'UNAUTHENTICATED'`.
   * Clients can then filter these out silently by the code rather than by
   * a fragile message string. The message itself is neutral so it never
   * shows up in logs as a scary "Unauthorized" line.
   */
  handleRequest<TUser = any>(err: any, user: any): TUser {
    // `err` is only set when the strategy's validate() itself throws — e.g.
    // the "cuenta suspendida" ForbiddenException. A missing/expired token
    // arrives as `user = false` with no err. Keep the real error so clients
    // can tell a banned account apart from a plain logged-out state.
    if (err) throw err;
    if (!user) {
      throw new GraphQLError('NO_SESSION', {
        extensions: { code: 'UNAUTHENTICATED' },
      });
    }
    return user;
  }
}
