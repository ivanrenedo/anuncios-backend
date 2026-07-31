import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AuditResolver } from './audit.resolver';
import { AuditService } from './audit.service';
import { AdminGuard } from '../auth/guards/admin.guard';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';

/**
 * Contract test for AuditResolver: pins the API surface — argument shape,
 * guard decoration, service pass-through, default paging.
 *
 * Pure and BD-free: guard behavior is exhaustively covered in
 * {admin,super-admin}.guard.spec.ts. Here we only assert that the resolver
 * still lists the right guards on the right handlers — a rename or removal
 * of a guard would slip through unit + integration otherwise and only bite
 * in production the first time a non-SUPER_ADMIN hits the mutation.
 */
describe('AuditResolver (contract)', () => {
  let resolver: AuditResolver;
  let service: { findAll: jest.Mock; deleteMany: jest.Mock };

  beforeEach(() => {
    service = { findAll: jest.fn(), deleteMany: jest.fn() };
    resolver = new AuditResolver(service as unknown as AuditService);
  });

  describe('adminActions() query', () => {
    it('forwards take/skip to the service', async () => {
      service.findAll.mockResolvedValue([]);
      await resolver.adminActions(25, 10);
      expect(service.findAll).toHaveBeenCalledWith(25, 10);
    });

    it('applies defaults when args are omitted (100 / 0)', async () => {
      service.findAll.mockResolvedValue([]);
      await resolver.adminActions();
      expect(service.findAll).toHaveBeenCalledWith(100, 0);
    });

    it('returns the service output unchanged', async () => {
      const rows = [{ id: 'a-1', action: 'x' }];
      service.findAll.mockResolvedValue(rows);
      await expect(resolver.adminActions(1, 0)).resolves.toBe(rows);
    });

    it('is guarded by AdminGuard (only)', () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        resolver.adminActions,
      );
      expect(guards).toEqual([AdminGuard]);
    });
  });

  describe('deleteAdminActions() mutation', () => {
    it('passes the ids array straight to service.deleteMany', async () => {
      service.deleteMany.mockResolvedValue(3);
      await resolver.deleteAdminActions(['a', 'b', 'c']);
      expect(service.deleteMany).toHaveBeenCalledWith(['a', 'b', 'c']);
    });

    it('returns the delete count from the service', async () => {
      service.deleteMany.mockResolvedValue(7);
      await expect(resolver.deleteAdminActions(['x'])).resolves.toBe(7);
    });

    it('accepts an empty ids array without hitting the service semantic', async () => {
      // deleteMany handles [] internally (returns 0) — the resolver forwards
      // the call regardless; that's the contract.
      service.deleteMany.mockResolvedValue(0);
      await expect(resolver.deleteAdminActions([])).resolves.toBe(0);
      expect(service.deleteMany).toHaveBeenCalledWith([]);
    });

    it('is guarded by AdminGuard AND SuperAdminGuard, in that order', () => {
      // Order matters: AdminGuard must run first because SuperAdminGuard reads
      // `req.user` populated by the JWT strategy that AdminGuard triggers.
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        resolver.deleteAdminActions,
      );
      expect(guards).toEqual([AdminGuard, SuperAdminGuard]);
    });
  });
});
