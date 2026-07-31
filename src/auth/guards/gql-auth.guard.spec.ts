import { ForbiddenException } from '@nestjs/common';
import { GraphQLError } from 'graphql';
import { GqlAuthGuard } from './gql-auth.guard';

describe('GqlAuthGuard.handleRequest', () => {
  const guard = new GqlAuthGuard();

  it('returns the user unchanged on success', () => {
    const user = { id: 'u-1', email: 'a@b.com' };
    expect(guard.handleRequest(null, user)).toBe(user);
  });

  it('re-throws err from the strategy (e.g. suspended account)', () => {
    const err = new ForbiddenException('Tu cuenta ha sido suspendida');
    expect(() => guard.handleRequest(err, false)).toThrow(err);
  });

  it('throws GraphQL UNAUTHENTICATED when there is no user and no err', () => {
    let caught: unknown;
    try {
      guard.handleRequest(null, false);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(GraphQLError);
    const gqlErr = caught as GraphQLError;
    expect(gqlErr.message).toBe('NO_SESSION');
    expect(gqlErr.extensions?.code).toBe('UNAUTHENTICATED');
  });

  it('prefers err over the missing-user branch', () => {
    const err = new Error('strategy blew up');
    expect(() => guard.handleRequest(err, false)).toThrow('strategy blew up');
  });

  it('throws UNAUTHENTICATED when user is null (not just false)', () => {
    expect(() => guard.handleRequest(null, null)).toThrow(GraphQLError);
  });
});
