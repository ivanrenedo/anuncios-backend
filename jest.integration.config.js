/**
 * Separate config for integration tests so `npm test` (unit only, fast) stays
 * fast and `npm run test:integration` (needs Postgres) is opt-in for CI/dev.
 * Suites end in `.integration.spec.ts`; unit suites keep the plain `.spec.ts`.
 */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testRegex: '.*\\.integration\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  // @faker-js/faker v10 ships ESM only. Jest's default is to skip node_modules
  // for transforms; whitelist faker so ts-jest converts it to CJS on the fly.
  transformIgnorePatterns: ['/node_modules/(?!(@faker-js/faker)/)'],
  testEnvironment: 'node',
  // Integration tests share a Postgres schema; run them serially so truncates
  // between suites don't step on each other.
  maxWorkers: 1,
  testTimeout: 30_000,
  globalSetup: '<rootDir>/test/integration/global-setup.ts',
  // Prisma keeps a pg pool alive after $disconnect() in some versions —
  // `forceExit` avoids the "Jest did not exit" warning without hiding real
  // leaks (they'd still show up under --detectOpenHandles).
  forceExit: true,
};
