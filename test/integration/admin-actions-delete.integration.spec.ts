import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createMock } from '@golevelup/ts-jest';
import { SuperAdminGuard } from '../../src/auth/guards/super-admin.guard';
import { AuditService } from '../../src/audit/audit.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { newTestPrisma, truncateAll } from './prisma-test.helper';
import { makeUser } from './factories';

/**
 * End-to-end flow for the SUPER_ADMIN-gated audit purge.
 * Skips HTTP/GraphQL bootstrap (which would drag in BullMQ + Redis + Firebase)
 * and drives the SAME guard + service that the resolver invokes:
 *
 *   1. non-SUPER_ADMIN with any role → ForbiddenException
 *   2. SUPER_ADMIN passes the guard, service actually deletes the rows
 *   3. Missing/unauthenticated request → ForbiddenException
 *
 * The GraphQL wrapper (AuditResolver) is a two-line pass-through — the risk
 * of breaking this flow lives entirely in the guard + service pair covered here.
 */
describe('SUPER_ADMIN gate for deleteAdminActions (integration)', () => {
  let prisma: PrismaClient;
  let guard: SuperAdminGuard;
  let audit: AuditService;

  const mockGqlContextWithUser = (userId: string | null): ExecutionContext =>
    createMock<ExecutionContext>({
      getType: () => 'graphql',
      getArgs: () => [undefined, {}, { req: userId ? { user: { id: userId } } : {} }, {}],
      getArgByIndex: (i: number) =>
        [undefined, {}, { req: userId ? { user: { id: userId } } : {} }, {}][i] as unknown,
    });

  beforeAll(() => {
    prisma = newTestPrisma();
    guard = new SuperAdminGuard(prisma as unknown as PrismaService);
    audit = new AuditService(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  async function seedRole(label: string) {
    return prisma.rol.create({
      data: { label, description: label, actions: ['read', 'update', 'delete'] },
    });
  }

  async function seedAdminActions(count: number) {
    const rows = [];
    for (let i = 0; i < count; i++) {
      rows.push(
        await prisma.adminAction.create({
          data: {
            action: 'test_event',
            targetType: 'user',
            targetId: 'fake',
            detail: `entry ${i}`,
          },
        }),
      );
    }
    return rows.map((r) => r.id);
  }

  it('SUPER_ADMIN role passes the guard and the delete goes through', async () => {
    const role = await seedRole('SUPER_ADMIN');
    const admin = await makeUser(prisma, { rol: { connect: { id: role.id } } });
    const ids = await seedAdminActions(3);

    await expect(guard.canActivate(mockGqlContextWithUser(admin.id))).resolves.toBe(true);

    const deleted = await audit.deleteMany(ids);
    expect(deleted).toBe(3);

    const remaining = await prisma.adminAction.count();
    expect(remaining).toBe(0);
  });

  it('SUPER_ADMIN label is normalized — "super-admin" also passes', async () => {
    const role = await seedRole('super-admin');
    const admin = await makeUser(prisma, { rol: { connect: { id: role.id } } });

    await expect(guard.canActivate(mockGqlContextWithUser(admin.id))).resolves.toBe(true);
  });

  it.each(['USER', 'MODERATOR', 'ADMIN'])(
    'role %p is rejected — audit rows survive',
    async (label) => {
      const role = await seedRole(label);
      const user = await makeUser(prisma, { rol: { connect: { id: role.id } } });
      const ids = await seedAdminActions(2);

      await expect(guard.canActivate(mockGqlContextWithUser(user.id))).rejects.toThrow(
        'Solo un SUPER_ADMIN puede hacer esto',
      );

      // Guard blocked, service should never run — rows untouched.
      const remaining = await prisma.adminAction.count();
      expect(remaining).toBe(2);
      expect(ids.length).toBe(2);
    },
  );

  it('user without any role assigned is rejected', async () => {
    const user = await makeUser(prisma); // makeUser leaves rolId null by default
    await expect(guard.canActivate(mockGqlContextWithUser(user.id))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('unauthenticated request (no user on ctx) is rejected before hitting DB', async () => {
    const spy = jest.spyOn(prisma.user, 'findUnique');
    await expect(guard.canActivate(mockGqlContextWithUser(null))).rejects.toThrow(
      'No autorizado',
    );
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('re-reads the role on every call so a demotion takes effect immediately', async () => {
    const superRole = await seedRole('SUPER_ADMIN');
    const userRole = await prisma.rol.create({
      data: { label: 'USER', description: 'demoted', actions: [] },
    });
    const admin = await makeUser(prisma, { rol: { connect: { id: superRole.id } } });

    // First call — SUPER_ADMIN.
    await expect(guard.canActivate(mockGqlContextWithUser(admin.id))).resolves.toBe(true);

    // Demote in-flight.
    await prisma.user.update({
      where: { id: admin.id },
      data: { rol: { connect: { id: userRole.id } } },
    });

    // Next call — the guard doesn't cache, so the new role kicks in.
    await expect(guard.canActivate(mockGqlContextWithUser(admin.id))).rejects.toThrow(
      'Solo un SUPER_ADMIN puede hacer esto',
    );
  });
});
