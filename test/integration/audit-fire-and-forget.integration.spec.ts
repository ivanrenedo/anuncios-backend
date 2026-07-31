import { PrismaClient } from '@prisma/client';
import { AuditService } from '../../src/audit/audit.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { newTestPrisma, truncateAll } from './prisma-test.helper';
import { makeUser } from './factories';

/**
 * AuditService.log is fire-and-forget by design: an audit write must NEVER
 * make the caller await, and MUST NEVER surface an error that would bubble up
 * and roll back the caller's mutation. This suite pins both invariants.
 */
describe('AuditService.log (integration)', () => {
  let prisma: PrismaClient;
  let audit: AuditService;
  let warnSpy: jest.SpyInstance;

  beforeAll(() => {
    prisma = newTestPrisma();
    audit = new AuditService(prisma as unknown as PrismaService);
    // The service uses Nest Logger internally; silence its warn output for a
    // clean test log and assert against it when we expect the failure branch.
    warnSpy = jest.spyOn((audit as any).logger, 'warn').mockImplementation();
  });

  afterAll(async () => {
    warnSpy.mockRestore();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    warnSpy.mockClear();
  });

  it('persists a row and returns synchronously (fire-and-forget)', async () => {
    const admin = await makeUser(prisma);

    // The method is `void` — it must not require awaiting.
    const rv = audit.log(admin.id, 'change_plan', 'user', admin.id, 'FREE → STAR');
    expect(rv).toBeUndefined();

    // Give the internal promise a tick to persist.
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setTimeout(r, 20));

    const rows = await prisma.adminAction.findMany({ where: { adminId: admin.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      adminId: admin.id,
      action: 'change_plan',
      targetType: 'user',
      targetId: admin.id,
      detail: 'FREE → STAR',
    });
  });

  it('accepts a null adminId (system-level actions) and stores null', async () => {
    audit.log(null, 'system_cleanup', 'user', 'ignored', 'nightly');
    await new Promise((r) => setTimeout(r, 20));

    const rows = await prisma.adminAction.findMany({ where: { action: 'system_cleanup' } });
    expect(rows).toHaveLength(1);
    expect(rows[0].adminId).toBeNull();
  });

  it('truncates detail to 255 chars', async () => {
    const long = 'x'.repeat(600);
    audit.log(null, 'oversize', 'user', 't', long);
    await new Promise((r) => setTimeout(r, 20));

    const [row] = await prisma.adminAction.findMany({ where: { action: 'oversize' } });
    expect(row.detail?.length).toBe(255);
  });

  it('never throws on FK violation — logs a warning and moves on', async () => {
    // adminId points at a user that does not exist → FK constraint fails.
    // The synchronous call must still return void without throwing, and the
    // caller (any mutation) keeps going.
    expect(() =>
      audit.log('00000000-0000-0000-0000-000000000000', 'boom', 'user', 't', 'x'),
    ).not.toThrow();

    // The promise inside rejects asynchronously — let it settle and check
    // the warning was logged (proves the catch fired, not that the whole
    // insert silently succeeded).
    await new Promise((r) => setTimeout(r, 50));
    expect(warnSpy).toHaveBeenCalled();
    const arg = warnSpy.mock.calls[0]?.[0] ?? '';
    expect(String(arg)).toContain('audit log failed');
  });

  it('a failing audit does not affect the surrounding transaction', async () => {
    const admin = await makeUser(prisma);

    // Simulate the real-world pattern: a business mutation fires an audit log,
    // and the mutation must still commit even if the audit insert would fail.
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: admin.id },
        data: { name: 'Renamed by biz mutation' },
      });
      // Fire-and-forget with a bad FK — the outer transaction shouldn't care.
      audit.log('00000000-0000-0000-0000-000000000000', 'x', 'user', 't', 'y');
    });

    await new Promise((r) => setTimeout(r, 50));

    // The business change survived.
    const after = await prisma.user.findUnique({ where: { id: admin.id } });
    expect(after?.name).toBe('Renamed by biz mutation');
  });
});
