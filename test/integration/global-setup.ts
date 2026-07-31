import 'dotenv/config';
import { execSync } from 'child_process';

/**
 * Runs once before the integration jest workers boot.
 * Delegates to `scripts/reset-test-db.ts` so the same command is available
 * as `npm run test:reset-db` for standalone use (CI cache warmup, debug).
 */
export default async function globalSetup(): Promise<void> {
  execSync('npx ts-node scripts/reset-test-db.ts', {
    stdio: 'inherit',
    env: process.env,
  });
}
