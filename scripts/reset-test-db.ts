/**
 * Wipes and re-provisions the `marketplace_test` schema so integration tests
 * start from a known baseline. Runs `prisma migrate deploy` under the hood so
 * the test schema stays in lockstep with the migration history.
 *
 * Usage:
 *   npm run test:reset-db          # standalone
 *   npm run test:integration       # runs this then jest
 *
 * Config: DATABASE_URL — override to point elsewhere.
 * Default: postgres://postgres:admin@localhost:5432/postgres?schema=marketplace_test
 */
import 'dotenv/config';
import { Client } from 'pg';
import { execSync } from 'child_process';

const TEST_SCHEMA = 'marketplace_test';
const url =
  process.env.TEST_DATABASE_URL ||
  `postgres://postgres:admin@localhost:5432/postgres?schema=${TEST_SCHEMA}`;

async function main() {
  const noSchemaUrl = url.replace(/[?&]schema=[^&]*/g, '');
  const client = new Client({ connectionString: noSchemaUrl });
  await client.connect();
  try {
    console.log(`Dropping and recreating schema "${TEST_SCHEMA}"…`);
    await client.query(`DROP SCHEMA IF EXISTS "${TEST_SCHEMA}" CASCADE`);
    await client.query(`CREATE SCHEMA "${TEST_SCHEMA}"`);
  } finally {
    await client.end();
  }

  console.log('Running prisma migrate deploy against test schema…');
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url },
  });

  // Prisma's migrate deploy doesn't reliably honor the URL `?schema=` param
  // when running unqualified `CREATE OR REPLACE FUNCTION` — the wrapper can
  // land on the dev schema's search_path instead of the test schema's. Pin
  // `immutable_unaccent` explicitly here so every integration test sees it.
  console.log('Ensuring immutable_unaccent inside test schema…');
  const client2 = new Client({ connectionString: noSchemaUrl });
  await client2.connect();
  try {
    await client2.query(`
      CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;
      CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
      CREATE OR REPLACE FUNCTION "${TEST_SCHEMA}".immutable_unaccent(text)
        RETURNS text
        LANGUAGE sql
        IMMUTABLE
        PARALLEL SAFE
        STRICT
      AS $$ SELECT public.unaccent($1) $$;
    `);
  } finally {
    await client2.end();
  }

  console.log('Test DB ready.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
