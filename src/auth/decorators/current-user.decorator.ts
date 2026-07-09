import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { PermissionAcces } from '@prisma/client';

/**
 * Shape of `req.user` as populated by the JWT strategy's `validate()`.
 */
export interface CurrentUser {
  id: string;
  email: string;
  permission: PermissionAcces;
  rolId: string | null;
}

/**
 * Injects the authenticated user's id from the GraphQL request context.
 *
 * Only valid on resolvers protected by `GqlAuthGuard`, which populates
 * `req.user` via the JWT strategy. Replaces the verbose
 * `@Context() ctx: any` + `ctx.req.user.id` pattern.
 */
export const GetCurrentUserId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const ctx = GqlExecutionContext.create(context);
    return (ctx.getContext().req.user as CurrentUser).id;
  },
);

/**
 * Injects the full authenticated user (`id`, `email`, `permission`) from the
 * GraphQL request context. Like {@link GetCurrentUserId}, only valid on
 * resolvers protected by `GqlAuthGuard`.
 */
export const GetCurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CurrentUser => {
    const ctx = GqlExecutionContext.create(context);
    return ctx.getContext().req.user as CurrentUser;
  },
);
