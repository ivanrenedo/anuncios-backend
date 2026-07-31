import { ForbiddenException } from '@nestjs/common';
import { SuperAdminGuard } from './super-admin.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { mockGqlContext, mockHttpContext } from '../../common/testing/execution-context.helper';

/**
 * Prisma 7's generated types are self-referential (`AND: T[]`, `OR: T[]`) which
 * breaks `DeepMocked<PrismaService>` inference. We hand-mock only the sub-API
 * the guard actually touches — cleaner and immune to future Prisma types.
 */
type MockedPrisma = {
  user: { findUnique: jest.Mock };
};

describe('SuperAdminGuard', () => {
  let guard: SuperAdminGuard;
  let prisma: MockedPrisma;

  const userWithRole = (label: string | null | undefined) => ({
    id: 'u-1',
    rol: label === undefined ? undefined : label === null ? null : { label },
  });

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn() } };
    guard = new SuperAdminGuard(prisma as unknown as PrismaService);
  });

  describe('rejects when no session', () => {
    it('throws when GraphQL request has no user', async () => {
      const ctx = mockGqlContext(null);
      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    it('throws when REST request has no user', async () => {
      const ctx = mockHttpContext(null);
      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('rejects non-SUPER_ADMIN roles', () => {
    it.each([
      ['USER'],
      ['ADMIN'],
      ['MODERATOR'],
      [''],
      [null],
      [undefined],
    ])('label %p → 403', async (label) => {
      prisma.user.findUnique.mockResolvedValue(userWithRole(label) as any);
      const ctx = mockGqlContext({ id: 'u-1' } as any);
      await expect(guard.canActivate(ctx)).rejects.toThrow(
        'Solo un SUPER_ADMIN puede hacer esto',
      );
    });
  });

  describe('accepts SUPER_ADMIN — normalized', () => {
    // The guard's normalizeLabel() uppercases and turns spaces/hyphens into
    // underscores so operators can create the role with different casings and
    // it still resolves.
    it.each([
      'SUPER_ADMIN',
      'super_admin',
      'Super Admin',
      '  super-admin  ',
      'SUPER-ADMIN',
    ])('label %p passes', async (label) => {
      prisma.user.findUnique.mockResolvedValue(userWithRole(label) as any);
      const ctx = mockGqlContext({ id: 'u-1' } as any);
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });
  });

  it('re-reads the role from DB on every call (no cache)', async () => {
    prisma.user.findUnique.mockResolvedValue(userWithRole('SUPER_ADMIN') as any);
    const ctx = mockGqlContext({ id: 'u-1' } as any);
    await guard.canActivate(ctx);
    await guard.canActivate(ctx);
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(2);
  });

  it('works from REST context too', async () => {
    prisma.user.findUnique.mockResolvedValue(userWithRole('SUPER_ADMIN') as any);
    const ctx = mockHttpContext({ id: 'u-1' } as any);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });
});
