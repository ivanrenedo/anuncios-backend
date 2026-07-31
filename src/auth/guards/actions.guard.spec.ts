import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ActionsGuard, REQUIRED_ACTIONS } from './actions.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { mockGqlContext } from '../../common/testing/execution-context.helper';

// See super-admin.guard.spec.ts for why we hand-mock instead of DeepMocked.
type MockedPrisma = { user: { findUnique: jest.Mock } };
type MockedReflector = { get: jest.Mock };

describe('ActionsGuard', () => {
  let guard: ActionsGuard;
  let prisma: MockedPrisma;
  let reflector: MockedReflector;

  const mockRole = (label: string | null, actions: string[]) => ({
    id: 'u-1',
    rol: { label, actions },
  });

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn() } };
    reflector = { get: jest.fn() };
    guard = new ActionsGuard(
      reflector as unknown as Reflector,
      prisma as unknown as PrismaService,
    );
  });

  it('allows requests to handlers without @RequireActions (unrestricted)', async () => {
    reflector.get.mockReturnValue(undefined);
    const ctx = mockGqlContext(null);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    // No DB hit when nothing to check.
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('allows when required actions is empty array', async () => {
    reflector.get.mockReturnValue([]);
    const ctx = mockGqlContext(null);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('throws when handler requires an action but request has no user', async () => {
    reflector.get.mockReturnValue(['delete']);
    const ctx = mockGqlContext(null);
    await expect(guard.canActivate(ctx)).rejects.toThrow('No autorizado');
  });

  describe('role matching', () => {
    beforeEach(() => {
      reflector.get.mockReturnValue(['delete']);
    });

    it('SUPER_ADMIN passes regardless of the role actions list', async () => {
      prisma.user.findUnique.mockResolvedValue(mockRole('SUPER_ADMIN', []) as any);
      const ctx = mockGqlContext({ id: 'u-1' } as any);
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });

    it('SUPER_ADMIN label is normalized (case + hyphens)', async () => {
      prisma.user.findUnique.mockResolvedValue(mockRole('super-admin', []) as any);
      const ctx = mockGqlContext({ id: 'u-1' } as any);
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });

    it('passes when the role includes the required action', async () => {
      prisma.user.findUnique.mockResolvedValue(
        mockRole('MODERATOR', ['read', 'delete']) as any,
      );
      const ctx = mockGqlContext({ id: 'u-1' } as any);
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });

    it('rejects when the role is missing at least one required action', async () => {
      reflector.get.mockReturnValue(['read', 'delete']);
      prisma.user.findUnique.mockResolvedValue(
        mockRole('MODERATOR', ['read']) as any,
      );
      const ctx = mockGqlContext({ id: 'u-1' } as any);
      await expect(guard.canActivate(ctx)).rejects.toThrow(
        'Tu rol no tiene permiso para esta acción',
      );
    });

    it('rejects when user has no role at all', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u-1', rol: null } as any);
      const ctx = mockGqlContext({ id: 'u-1' } as any);
      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    it('rejects when the role exists but has null actions', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u-1',
        rol: { label: 'USER', actions: null },
      } as any);
      const ctx = mockGqlContext({ id: 'u-1' } as any);
      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });
  });

  it('reads the metadata key REQUIRED_ACTIONS from the handler', async () => {
    reflector.get.mockReturnValue(['update']);
    prisma.user.findUnique.mockResolvedValue(mockRole('SUPER_ADMIN', []) as any);
    const ctx = mockGqlContext({ id: 'u-1' } as any);
    await guard.canActivate(ctx);
    expect(reflector.get).toHaveBeenCalledWith(REQUIRED_ACTIONS, expect.anything());
  });
});
