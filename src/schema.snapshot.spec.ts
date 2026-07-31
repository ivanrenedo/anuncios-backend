import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Guards the GraphQL schema against unintended changes. Rationale:
 *   - The mobile app is compiled against this schema; a rename/removal of a
 *     field breaks users in production before they ever open their store.
 *   - The frontend admin ships pre-built (Next standalone) with typed queries.
 *   - Snapshots put a deliberate step ("update snapshot") between an accidental
 *     schema change and a merge — reviewers see the diff in the PR.
 *
 * Update flow when the change is intended:
 *   npm test -- schema.snapshot.spec -u
 * and commit the new snapshot.
 */
describe('GraphQL schema', () => {
  const schemaPath = join(process.cwd(), 'src', 'schema.gql');

  it('exists on disk (autogen must have run at least once)', () => {
    expect(existsSync(schemaPath)).toBe(true);
  });

  it('matches the committed snapshot', () => {
    // Normalise line endings — Windows vs Unix would otherwise churn the
    // snapshot every time the file is regenerated on a different OS.
    const schema = readFileSync(schemaPath, 'utf8').replace(/\r\n/g, '\n');
    expect(schema).toMatchSnapshot();
  });
});
