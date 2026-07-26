import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { promises as fs } from 'fs';
import { join, resolve, basename } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './storage.service';

const UPLOADS_ROOT = resolve(process.cwd(), 'uploads');
const LEGACY_URL_PREFIX = '/uploads/';
const SPACES_PREFIX = 'media/';
// Files younger than this are spared — a user may have uploaded one and not
// submitted the form yet, in which case there's no DB reference on purpose.
const MIN_AGE_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class UploadCron {
  private readonly logger = new Logger(UploadCron.name);

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  /**
   * Nightly sweep of unreferenced media in both the legacy `uploads/` folder
   * and the Spaces bucket. Catches the one leak the per-mutation cleanup
   * can't: files uploaded through /upload/image but never saved to a product
   * or profile.
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async cleanOrphans() {
    const [refUrls, refKeys] = await this.collectReferenced();
    await Promise.all([
      this.cleanLegacyDisk(refUrls),
      this.cleanSpaces(refKeys),
    ]);
  }

  private async cleanLegacyDisk(referencedBasenames: Set<string>) {
    let entries: string[];
    try {
      entries = await fs.readdir(UPLOADS_ROOT);
    } catch (err: any) {
      if (err?.code !== 'ENOENT') {
        this.logger.warn(`Read uploads dir failed: ${err?.message ?? err}`);
      }
      return;
    }

    const cutoff = Date.now() - MIN_AGE_MS;
    let removed = 0;
    for (const name of entries) {
      if (referencedBasenames.has(name)) continue;
      const abs = join(UPLOADS_ROOT, name);
      try {
        const stat = await fs.stat(abs);
        if (!stat.isFile()) continue;
        if (stat.mtimeMs > cutoff) continue;
        await fs.unlink(abs);
        removed++;
      } catch (err: any) {
        if (err?.code !== 'ENOENT') {
          this.logger.warn(`Unlink ${name}: ${err?.message ?? err}`);
        }
      }
    }
    if (removed > 0) {
      this.logger.log(`Orphan cleanup (disk): removed ${removed} file(s)`);
    }
  }

  private async cleanSpaces(referencedKeys: Set<string>) {
    let objects;
    try {
      objects = await this.storage.listObjects(SPACES_PREFIX);
    } catch (err: any) {
      this.logger.warn(`List Spaces failed: ${err?.message ?? err}`);
      return;
    }
    if (!objects.length) return;

    const cutoff = Date.now() - MIN_AGE_MS;
    let removed = 0;
    for (const obj of objects) {
      const key = obj.Key;
      if (!key) continue;
      if (referencedKeys.has(key)) continue;
      const ageOk = obj.LastModified
        ? obj.LastModified.getTime() < cutoff
        : false;
      if (!ageOk) continue;
      await this.storage.deleteObject(key);
      removed++;
    }
    if (removed > 0) {
      this.logger.log(`Orphan cleanup (Spaces): removed ${removed} object(s)`);
    }
  }

  /**
   * Walk every column that stores a media URL. Returns two sets:
   *  - `basenames` for legacy `/uploads/<name>` URLs (matched against disk).
   *  - `keys` for full Spaces URLs (matched against ListObjectsV2 output).
   */
  private async collectReferenced(): Promise<[Set<string>, Set<string>]> {
    const basenames = new Set<string>();
    const keys = new Set<string>();

    const record = (url: string | null | undefined) => {
      if (!url) return;
      if (url.startsWith(LEGACY_URL_PREFIX)) {
        const name = basename(url.slice(LEGACY_URL_PREFIX.length));
        if (name) basenames.add(name);
        return;
      }
      const key = this.storage.keyFromUrl(url);
      if (key) keys.add(key);
    };

    const [avatars, covers, productImages] = await Promise.all([
      this.prisma.user.findMany({
        where: { avatarUrl: { not: null } },
        select: { avatarUrl: true },
      }),
      this.prisma.user.findMany({
        where: { coverUrl: { not: null } },
        select: { coverUrl: true },
      }),
      this.prisma.productImage.findMany({
        select: { url: true, thumbnailUrl: true },
      }),
    ]);

    for (const u of avatars) record(u.avatarUrl);
    for (const u of covers) record(u.coverUrl);
    for (const p of productImages) {
      record(p.url);
      record(p.thumbnailUrl);
    }
    return [basenames, keys];
  }
}
