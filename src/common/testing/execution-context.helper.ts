import { ExecutionContext } from '@nestjs/common';
import { createMock } from '@golevelup/ts-jest';

/**
 * Test helpers to fabricate `ExecutionContext` instances that guards can
 * inspect. Two flavors — HTTP (REST controllers) and GraphQL (resolvers) —
 * because our guards branch on `context.getType()` and rebuild the request
 * accordingly.
 */

export type FakeUser = {
  id?: string;
  email?: string;
  permission?: 'GRANTED' | 'DENIED';
  rolId?: string | null;
} | null;

export function mockHttpContext(user: FakeUser = null): ExecutionContext {
  const req = user ? { user } : {};
  return createMock<ExecutionContext>({
    getType: () => 'http',
    switchToHttp: () =>
      ({
        getRequest: () => req,
      }) as any,
  });
}

export function mockGqlContext(user: FakeUser = null): ExecutionContext {
  const req = user ? { user } : {};
  // The guards under test call `GqlExecutionContext.create(context).getContext().req`.
  // Since `GqlExecutionContext.create` is a static factory that reads the raw
  // args from the context, we mock the args to carry a fake GraphQL info +
  // the request object.
  return createMock<ExecutionContext>({
    getType: () => 'graphql',
    getArgs: () => [
      /* root  */ undefined,
      /* args  */ {},
      /* ctx   */ { req },
      /* info  */ {},
    ],
    getArgByIndex: (i: number) =>
      [undefined, {}, { req }, {}][i] as unknown,
  });
}
