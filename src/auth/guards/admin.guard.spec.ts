import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { mockGqlContext, mockHttpContext } from '../../common/testing/execution-context.helper';

/**
 * `AdminGuard extends AuthGuard('jwt')`, so `super.canActivate(context)` is the
 * Passport strategy resolution. We stub it via a subclass instead of mocking
 * `passport` — cleaner and doesn't couple the test to internals.
 */
class TestableAdminGuard extends AdminGuard {
  public superResult: boolean | Promise<boolean> = true;
  override canActivate(context: ExecutionContext) {
    const original = AdminGuard.prototype.canActivate;
    const superProto = Object.getPrototypeOf(AdminGuard.prototype);
    superProto.canActivate = () => this.superResult;
    try {
      return original.call(this, context);
    } finally {
      // Restore, so parallel tests don't leak the stub.
      delete superProto.canActivate;
    }
  }
}

describe('AdminGuard', () => {
  let guard: TestableAdminGuard;

  beforeEach(() => {
    guard = new TestableAdminGuard();
  });

  it('rejects if the underlying JWT strategy denies', async () => {
    guard.superResult = false;
    const ctx = mockGqlContext({ id: 'u', permission: 'GRANTED', rolId: 'r' });
    await expect(guard.canActivate(ctx)).resolves.toBe(false);
  });

  it('rejects when permission is not GRANTED', async () => {
    const ctx = mockGqlContext({ id: 'u', permission: 'DENIED', rolId: 'r' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(
      'Requiere acceso de administrador',
    );
  });

  it('rejects when permission is missing entirely', async () => {
    const ctx = mockGqlContext({ id: 'u', rolId: 'r' } as any);
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('rejects a GRANTED user with no role assigned', async () => {
    const ctx = mockGqlContext({ id: 'u', permission: 'GRANTED', rolId: null });
    await expect(guard.canActivate(ctx)).rejects.toThrow(
      'Requiere un rol asignado para acceder al panel',
    );
  });

  it('accepts a GRANTED user with a rolId', async () => {
    const ctx = mockGqlContext({ id: 'u', permission: 'GRANTED', rolId: 'r' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('works with REST context too', async () => {
    const ctx = mockHttpContext({ id: 'u', permission: 'GRANTED', rolId: 'r' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });
});
