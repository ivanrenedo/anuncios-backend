import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GqlExecutionContext } from '@nestjs/graphql';

@Injectable()
export class OptionalGqlAuthGuard extends AuthGuard('jwt') {
  getRequest(context: ExecutionContext) {
    return GqlExecutionContext.create(context).getContext().req;
  }

  handleRequest<TUser = any>(err: any, user: any): TUser {
    // `err` is set when validate() threw (e.g. suspended account) — keep
    // propagating so the client sees "Cuenta suspendida" instead of a silent
    // null. Only the "no token / expired" case (err == null && !user) is
    // downgraded to a nullable response.
    if (err) throw err;
    return (user || null) as TUser;
  }
}
