import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_SCHEMA = 'marketplace_test';
const url =
  process.env.TEST_DATABASE_URL ||
  `postgres://postgres:admin@localhost:5432/postgres?schema=${TEST_SCHEMA}`;

/**
 * Fresh Prisma client bound to the isolated `marketplace_test` schema.
 * Mirrors the production `PrismaService` construction (pg driver + explicit
 * search_path) so the raw SQL in matchingIdsByText, unaccent helpers, etc.
 * resolve exactly the same way as at runtime.
 */
export function newTestPrisma(): PrismaClient {
  const pool = new Pool({
    connectionString: url,
    // Include `public` so pg_trgm's similarity()/gin_trgm_ops and any other
    // extensions installed there resolve without qualification — mirrors the
    // production PrismaService which also has public on the path.
    options: `-c search_path=${TEST_SCHEMA},public`,
  });
  const adapter = new PrismaPg(pool, { schema: TEST_SCHEMA });
  return new PrismaClient({ adapter });
}

/**
 * Wipes every user-writable table between tests. Order-independent thanks to
 * `TRUNCATE ... CASCADE`, which propagates through FKs. Skips the
 * `_prisma_migrations` table so we don't have to re-migrate every test.
 */
export async function truncateAll(prisma: PrismaClient): Promise<void> {
  // List tables via information_schema so we auto-pick up new models without
  // maintaining a hand-written truncate list.
  const rows = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = ${TEST_SCHEMA}
      AND tablename <> '_prisma_migrations'
  `;
  if (rows.length === 0) return;
  const list = rows.map((r) => `"${TEST_SCHEMA}"."${r.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}
