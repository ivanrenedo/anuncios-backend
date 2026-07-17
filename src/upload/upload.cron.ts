import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { promises as fs } from 'fs';
import { join, resolve, basename } from 'path';
import { PrismaService } from '../prisma/prisma.service';

const UPLOADS_ROOT = resolve(process.cwd(), 'uploads');
const URL_PREFIX = '/uploads/';
// Files younger than this are spared — a user may have uploaded one and not
// submitted the form yet, in which case there's no DB reference on purpose.
const MIN_AGE_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class UploadCron {
  private readonly logger = new Logger(UploadCron.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Nightly sweep of `uploads/` for files no DB row references. Catches the
   * one leak the per-mutation cleanup can't: photos uploaded through
   * /upload/image but never saved to a product or profile.
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async cleanOrphans() {
    let entries: string[];
    try {
      entries = await fs.readdir(UPLOADS_ROOT);
    } catch (err: any) {
      if (err?.code !== 'ENOENT') {
        this.logger.warn(`Read uploads dir failed: ${err?.message ?? err}`);
      }
      return;
    }

    const referenced = await this.collectReferencedBasenames();
    const cutoff = Date.now() - MIN_AGE_MS;
    let removed = 0;

    for (const name of entries) {
      if (referenced.has(name)) continue;
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
      this.logger.log(`Orphan cleanup: removed ${removed} unreferenced upload(s)`);
    }
  }

  private async collectReferencedBasenames(): Promise<Set<string>> {
    const set = new Set<string>();
    const add = (url: string | null | undefined) => {
      if (!url || !url.startsWith(URL_PREFIX)) return;
      const name = basename(url.slice(URL_PREFIX.length));
      if (name) set.add(name);
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
      this.prisma.productImage.findMany({ select: { url: true } }),
    ]);

    for (const u of avatars) add(u.avatarUrl);
    for (const u of covers) add(u.coverUrl);
    for (const p of productImages) add(p.url);
    return set;
  }
}
