import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  BadRequestException,
  Body,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuid } from 'uuid';
import { StorageService } from './storage.service';

// MIME → extension map used to build Spaces keys for presigned uploads (we
// can't trust filenames from the client). Anything not in this list is
// rejected at the presign endpoint, which is our first line of defense.
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

const imageFilter = (_req: any, file: Express.Multer.File, cb: any) => {
  if (!file.mimetype.match(/\/(jpg|jpeg|png|gif|webp)$/)) {
    cb(new BadRequestException('Solo se permiten archivos de imagen'), false);
  } else {
    cb(null, true);
  }
};

const MULTER_OPTS = {
  storage: memoryStorage(),
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
};

function keyFor(file: Express.Multer.File): string {
  return `media/${uuid()}${extname(file.originalname)}`;
}

interface PresignBody {
  contentType?: string;
}

@Controller('upload')
export class UploadController {
  constructor(private readonly storage: StorageService) {}

  @Post('image')
  @UseInterceptors(FileInterceptor('file', MULTER_OPTS))
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No se subió ningún archivo');
    const url = await this.storage.putObject(
      file.buffer,
      keyFor(file),
      file.mimetype,
    );
    return { url };
  }

  @Post('images')
  @UseInterceptors(FilesInterceptor('files', 8, MULTER_OPTS))
  async uploadImages(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files?.length)
      throw new BadRequestException('No se subieron archivos');
    const urls = await Promise.all(
      files.map((f) => this.storage.putObject(f.buffer, keyFor(f), f.mimetype)),
    );
    return { urls };
  }

  /**
   * Returns a short-lived signed PUT URL so the client can upload straight to
   * Spaces without proxying bytes through the server. Tight rate limit — a
   * bad actor could otherwise burn the Spaces bill by requesting endless
   * presigns and orphaning uploads until the nightly cron sweeps them.
   */
  @Post('presign')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  async presign(@Body() body: PresignBody) {
    const contentType = (body?.contentType || '').toLowerCase();
    const ext = MIME_TO_EXT[contentType];
    if (!ext) {
      throw new BadRequestException(
        'Tipo de archivo no soportado. Usa JPG, PNG, GIF, WebP, MP4, MOV o WebM.',
      );
    }
    const key = `media/${uuid()}.${ext}`;
    return this.storage.presignPut(key, contentType);
  }
}
