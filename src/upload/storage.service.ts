import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join, resolve, sep, basename } from 'path';

const UPLOADS_ROOT = resolve(process.cwd(), 'uploads');
const URL_PREFIX = '/uploads/';

/**
 * Frees disk space when the DB drops an image reference: pair every DB write
 * that removes or replaces an `avatarUrl`/`coverUrl`/`ProductImage.url` with a
 * call here. Only touches files served from `/uploads/…` — external URLs (a
 * future CDN) are ignored, so this stays a no-op once we migrate.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  async deleteFile(url: string | null | undefined): Promise<void> {
    const abs = this.resolveUploadPath(url);
    if (!abs) return;
    try {
      await fs.unlink(abs);
    } catch (err: any) {
      // Missing file is fine — the DB row is already gone, nothing to reclaim.
      if (err?.code === 'ENOENT') return;
      this.logger.warn(`Failed to delete ${abs}: ${err?.message ?? err}`);
    }
  }

  async deleteFiles(urls: (string | null | undefined)[]): Promise<void> {
    await Promise.all(urls.map((u) => this.deleteFile(u)));
  }

  /**
   * Returns the absolute file path only if `url` is an internal upload and
   * resolves inside `UPLOADS_ROOT`. Anything else (external URL, path escape,
   * empty) returns null so callers silently no-op.
   */
  private resolveUploadPath(url: string | null | undefined): string | null {
    if (!url || typeof url !== 'string') return null;
    if (!url.startsWith(URL_PREFIX)) return null;
    const name = basename(url.slice(URL_PREFIX.length));
    if (!name || name === '.' || name === '..') return null;
    const abs = join(UPLOADS_ROOT, name);
    if (abs !== UPLOADS_ROOT + sep + name) return null;
    return abs;
  }
}
