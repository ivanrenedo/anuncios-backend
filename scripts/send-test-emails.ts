/**
 * One-off script to send the V2 email templates to a real recipient for
 * visual QA. Bootstraps a standalone Nest context so we don't need to bring
 * up the HTTP server or the BullMQ workers — the sends bypass the queue and
 * hit Resend directly through EmailService.send().
 *
 * Run:
 *   npx ts-node --transpile-only scripts/send-test-emails.ts
 *
 * Requires RESEND_API_KEY in .env. Each send uses a timestamped dedupeKey so
 * re-runs deliver every time (instead of being deduped away).
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';

const TO = 'digitalcorps365@gmail.com';
const NAME = 'Benjamin Buika Renedo';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });
  const email = app.get(EmailService);
  const stamp = Date.now();
  const runId = `test-${stamp}`;

  const runs: Array<{ label: string; run: () => Promise<string | null> }> = [
    {
      label: 'plan_expiring',
      run: () =>
        email.send({
          toEmail: TO,
          dedupeKey: `${runId}:plan_expiring`,
          payload: {
            template: 'plan_expiring',
            data: {
              userName: NAME,
              planLabel: 'Premium',
              daysLeft: 5,
              expiresAt: new Date(Date.now() + 5 * 86_400_000),
              contactWhatsapp: '240222626418',
            },
          },
        }),
    },
    {
      label: 'plan_expired',
      run: () =>
        email.send({
          toEmail: TO,
          dedupeKey: `${runId}:plan_expired`,
          payload: {
            template: 'plan_expired',
            data: {
              userName: NAME,
              planLabel: 'Premium',
              contactWhatsapp: '240222626418',
            },
          },
        }),
    },
    {
      label: 'activity_digest',
      run: () =>
        email.send({
          toEmail: TO,
          dedupeKey: `${runId}:activity_digest`,
          payload: {
            template: 'activity_digest',
            data: {
              userName: NAME,
              favoritesReceived: 14,
              contactsReceived: 6,
              newFollowers: 3,
              reviewsReceived: 2,
              weekLabel: '24 jul – 31 jul',
            },
          },
        }),
    },
    {
      label: 'comeback',
      run: () =>
        email.send({
          toEmail: TO,
          dedupeKey: `${runId}:comeback`,
          payload: {
            template: 'comeback',
            data: {
              userName: NAME,
              daysSinceLastSeen: 72,
              newProductsCount: 1240,
            },
          },
        }),
    },
    {
      label: 'admin_weekly_summary',
      run: () =>
        email.send({
          toEmail: TO,
          dedupeKey: `${runId}:admin_weekly_summary`,
          payload: {
            template: 'admin_weekly_summary',
            data: {
              adminName: NAME,
              pendingReports: 4,
              pendingVerifications: 7,
              newUsersThisWeek: 32,
              paidPlansThisWeek: 5,
              revenueXaf: 45_000,
              weekLabel: '24 jul – 31 jul',
            },
          },
        }),
    },
  ];

  for (const { label, run } of runs) {
    try {
      const id = await run();
      console.log(
        id ? `✓ ${label} → ${TO} (log ${id})` : `~ ${label} skipped (dedupe)`,
      );
    } catch (e: any) {
      console.error(`✗ ${label} failed: ${e?.message ?? e}`);
    }
  }

  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
