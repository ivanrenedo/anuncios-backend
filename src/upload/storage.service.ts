import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { join, resolve, sep, basename } from 'path';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  type ObjectCannedACL,
  type _Object,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const UPLOADS_ROOT = resolve(process.cwd(), 'uploads');
const LEGACY_URL_PREFIX = '/uploads/';

/**
 * Media storage for the marketplace. Routes uploads to DigitalOcean Spaces
 * (S3-compatible) while transparently keeping the legacy local `uploads/`
 * folder alive for rows that predate the Spaces migration — this lets us
 * ship without touching existing DB URLs.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3?: S3Client;
  private readonly bucket?: string;
  private readonly publicBase?: string;

  constructor(private readonly config: ConfigService) {
    const endpoint = config.get<string>('SPACES_ENDPOINT');
    const region = config.get<string>('SPACES_REGION');
    const bucket = config.get<string>('SPACES_BUCKET');
    const accessKeyId = config.get<string>('SPACES_ACCESS_KEY_ID');
    const secretAccessKey = config.get<string>('SPACES_SECRET_ACCESS_KEY');

    if (endpoint && region && bucket && accessKeyId && secretAccessKey) {
      this.s3 = new S3Client({
        endpoint,
        region,
        credentials: { accessKeyId, secretAccessKey },
        forcePathStyle: false,
      });
      this.bucket = bucket;
      // Prefer an explicit CDN base if configured, else derive from endpoint.
      // `SPACES_PUBLIC_URL` should point at the CDN (e.g.
      // https://mybucket.fra1.cdn.digitaloceanspaces.com) so URLs baked into
      // DB rows survive a CDN toggle later.
      const explicit = config.get<string>('SPACES_PUBLIC_URL');
      this.publicBase = (explicit ??
        `${endpoint.replace(/\/+$/, '')}/${bucket}`
      ).replace(/\/+$/, '');
    } else {
      this.logger.warn(
        'Spaces credentials missing — upload/delete will fall back to local disk only.',
      );
    }
  }

  /** Returns the public URL of the stored object. */
  async putObject(
    buffer: Buffer,
    key: string,
    contentType: string,
  ): Promise<string> {
    if (!this.s3 || !this.bucket) {
      throw new Error('Spaces is not configured — cannot upload.');
    }
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        ACL: 'public-read' as ObjectCannedACL,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    return `${this.publicBase}/${key}`;
  }

  /**
   * Presigned PUT for direct client → Spaces uploads. The client MUST send
   * the exact `Content-Type` header we signed with; otherwise Spaces returns
   * 403. The returned `publicUrl` is what should end up in DB.
   */
  async presignPut(
    key: string,
    contentType: string,
    expiresIn = 300,
  ): Promise<{
    uploadUrl: string;
    publicUrl: string;
    key: string;
    expiresAt: string;
  }> {
    if (!this.s3 || !this.bucket) {
      throw new Error('Spaces is not configured — cannot presign upload.');
    }
    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      ACL: 'public-read' as ObjectCannedACL,
      CacheControl: 'public, max-age=31536000, immutable',
    });
    const uploadUrl = await getSignedUrl(this.s3, cmd, { expiresIn });
    return {
      uploadUrl,
      publicUrl: `${this.publicBase}/${key}`,
      key,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    };
  }

  async deleteFile(url: string | null | undefined): Promise<void> {
    if (!url) return;

    // Legacy local file — reclaim disk space.
    if (url.startsWith(LEGACY_URL_PREFIX)) {
      const abs = this.resolveUploadPath(url);
      if (!abs) return;
      try {
        await fs.unlink(abs);
      } catch (err: any) {
        if (err?.code === 'ENOENT') return;
        this.logger.warn(`Failed to delete ${abs}: ${err?.message ?? err}`);
      }
      return;
    }

    // Spaces object — best-effort delete via the S3 API.
    const key = this.keyFromUrl(url);
    if (!key || !this.s3 || !this.bucket) return;
    try {
      await this.s3.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (err: any) {
      this.logger.warn(
        `Failed to delete Spaces object ${key}: ${err?.message ?? err}`,
      );
    }
  }

  async deleteFiles(urls: (string | null | undefined)[]): Promise<void> {
    await Promise.all(urls.map((u) => this.deleteFile(u)));
  }

  /**
   * Cron helper: list every object under `prefix` in the bucket. Yields the
   * full list; caller filters against DB references.
   */
  async listObjects(prefix = ''): Promise<_Object[]> {
    if (!this.s3 || !this.bucket) return [];
    const out: _Object[] = [];
    let ContinuationToken: string | undefined;
    do {
      const res = await this.s3.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken,
        }),
      );
      if (res.Contents) out.push(...res.Contents);
      ContinuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (ContinuationToken);
    return out;
  }

  async deleteObject(key: string): Promise<void> {
    if (!this.s3 || !this.bucket) return;
    try {
      await this.s3.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (err: any) {
      this.logger.warn(
        `Failed to delete Spaces object ${key}: ${err?.message ?? err}`,
      );
    }
  }

  /**
   * Extract the object key from a URL that lives in our Spaces bucket. Any
   * URL from a different host (external CDN, third-party image, etc.) yields
   * null so callers silently no-op.
   */
  keyFromUrl(url: string): string | null {
    if (!this.publicBase) return null;
    if (!url.startsWith(this.publicBase + '/')) return null;
    const key = url.slice(this.publicBase.length + 1);
    // Reject empties and traversal — Spaces would 400 anyway but avoid noise.
    if (!key || key.includes('..')) return null;
    return key;
  }

  /**
   * Returns the absolute file path only if `url` is an internal upload and
   * resolves inside `UPLOADS_ROOT`. Anything else (external URL, path escape,
   * empty) returns null so callers silently no-op.
   */
  private resolveUploadPath(url: string | null | undefined): string | null {
    if (!url || typeof url !== 'string') return null;
    if (!url.startsWith(LEGACY_URL_PREFIX)) return null;
    const name = basename(url.slice(LEGACY_URL_PREFIX.length));
    if (!name || name === '.' || name === '..') return null;
    const abs = join(UPLOADS_ROOT, name);
    if (abs !== UPLOADS_ROOT + sep + name) return null;
    return abs;
  }
}
