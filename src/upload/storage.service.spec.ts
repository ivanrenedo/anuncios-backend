import { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';

/**
 * The S3 side of StorageService requires DO Spaces credentials — those live
 * in an integration test suite that hits a real bucket. Here we only exercise
 * the two pure helpers `keyFromUrl` and `resolveUploadPath` (via the private
 * behavior of `deleteFile`) that are the SECURITY-critical bits:
 *   - path traversal must NEVER escape the uploads root
 *   - URLs from a different host must be silently ignored, never mutated
 */

function makeService(spaces: {
  endpoint?: string;
  region?: string;
  bucket?: string;
  key?: string;
  secret?: string;
  publicUrl?: string;
} = {}): StorageService {
  const values: Record<string, string | undefined> = {
    SPACES_ENDPOINT: spaces.endpoint,
    SPACES_REGION: spaces.region,
    SPACES_BUCKET: spaces.bucket,
    SPACES_ACCESS_KEY_ID: spaces.key,
    SPACES_SECRET_ACCESS_KEY: spaces.secret,
    SPACES_PUBLIC_URL: spaces.publicUrl,
  };
  const config = {
    get: (k: string) => values[k],
  } as unknown as ConfigService;
  return new StorageService(config);
}

describe('StorageService.keyFromUrl', () => {
  const service = makeService({
    endpoint: 'https://fra1.digitaloceanspaces.com',
    region: 'fra1',
    bucket: 'bomelh-media',
    key: 'k',
    secret: 's',
    publicUrl: 'https://bomelh-media.fra1.cdn.digitaloceanspaces.com',
  });

  it('extracts the key from a URL under our public base', () => {
    expect(
      service.keyFromUrl(
        'https://bomelh-media.fra1.cdn.digitaloceanspaces.com/media/uuid.jpg',
      ),
    ).toBe('media/uuid.jpg');
  });

  it('returns null for a URL from a different host', () => {
    expect(service.keyFromUrl('https://other-cdn.example.com/media/x.jpg')).toBeNull();
  });

  it('returns null for a legacy `/uploads/…` URL (not our bucket)', () => {
    expect(service.keyFromUrl('/uploads/xxx.jpg')).toBeNull();
  });

  it('returns null when the URL matches only as a prefix (no trailing slash)', () => {
    // publicBase = "https://…digitaloceanspaces.com" — a URL that stops there
    // has no key to extract, so we bail rather than return an empty key.
    expect(
      service.keyFromUrl('https://bomelh-media.fra1.cdn.digitaloceanspaces.com'),
    ).toBeNull();
  });

  it('rejects path traversal attempts', () => {
    expect(
      service.keyFromUrl(
        'https://bomelh-media.fra1.cdn.digitaloceanspaces.com/media/../secret.jpg',
      ),
    ).toBeNull();
  });
});

describe('StorageService — Spaces not configured', () => {
  it('keyFromUrl returns null with no publicBase set', () => {
    const service = makeService({});
    expect(
      service.keyFromUrl(
        'https://bomelh-media.fra1.cdn.digitaloceanspaces.com/media/x.jpg',
      ),
    ).toBeNull();
  });

  it('deleteFile silently no-ops on external URLs (no crash, no throw)', async () => {
    const service = makeService({});
    // With Spaces unconfigured, external URLs have no local file to touch —
    // must resolve, not throw.
    await expect(
      service.deleteFile('https://any-cdn.example.com/x.jpg'),
    ).resolves.toBeUndefined();
  });

  it('deleteFile no-ops on null/undefined/empty', async () => {
    const service = makeService({});
    await expect(service.deleteFile(null)).resolves.toBeUndefined();
    await expect(service.deleteFile(undefined)).resolves.toBeUndefined();
    await expect(service.deleteFile('')).resolves.toBeUndefined();
  });
});

describe('StorageService.deleteFile — legacy /uploads/ path safety', () => {
  const service = makeService({});

  it('rejects `..` in the basename (path traversal)', async () => {
    // Should not throw — the guard returns null internally and no unlink runs.
    await expect(service.deleteFile('/uploads/..')).resolves.toBeUndefined();
    await expect(service.deleteFile('/uploads/.')).resolves.toBeUndefined();
  });

  it('accepts an ordinary basename without crashing (file may not exist)', async () => {
    // basename() strips subpath components — even if the file is missing on
    // disk the ENOENT is swallowed, so this must resolve.
    await expect(
      service.deleteFile('/uploads/nonexistent-abcdef.jpg'),
    ).resolves.toBeUndefined();
  });

  it('is idempotent — same URL called twice does not throw', async () => {
    await service.deleteFile('/uploads/no-such-file.jpg');
    await expect(
      service.deleteFile('/uploads/no-such-file.jpg'),
    ).resolves.toBeUndefined();
  });
});
