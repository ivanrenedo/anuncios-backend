import {
  Controller,
  Get,
  Query,
  Res,
  Logger,
  Injectable,
} from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Signs / verifies short unsubscribe tokens. Uses the app's JWT_SECRET but
 * with a distinct `aud` so a leaked auth token can't unsubscribe someone and
 * vice-versa. Tokens are opaque to the recipient — the payload just carries
 * the user id and the preference key to flip.
 */
@Injectable()
export class UnsubscribeTokenService {
  private jwt: JwtService;
  private baseUrl: string;

  constructor(config: ConfigService) {
    const secret = config.get<string>('JWT_SECRET') || 'dev-only-secret';
    this.jwt = new JwtService({ secret });
    // Public base URL where the unsubscribe endpoint is reachable from an
    // email link. Falls back to the API's own host in dev.
    this.baseUrl =
      config.get<string>('PUBLIC_API_URL') ||
      config.get<string>('API_PUBLIC_URL') ||
      'http://localhost:3000';
  }

  sign(userId: string, key: 'notifMarketing' | 'notifOffers'): string {
    return this.jwt.sign(
      { sub: userId, k: key },
      { audience: 'email-unsubscribe', expiresIn: '90d' },
    );
  }

  /** Builds the full URL the recipient clicks. */
  urlFor(userId: string, key: 'notifMarketing' | 'notifOffers'): string {
    return `${this.baseUrl.replace(/\/$/, '')}/api/email/unsubscribe?t=${this.sign(userId, key)}`;
  }

  verify(token: string): { userId: string; key: string } | null {
    try {
      const payload = this.jwt.verify<any>(token, {
        audience: 'email-unsubscribe',
      });
      return { userId: payload.sub, key: payload.k };
    } catch {
      return null;
    }
  }
}

/**
 * One-click unsubscribe. Rendered as a static confirmation page so the
 * recipient sees clear feedback without needing to sign in. We only accept
 * flipping preferences OFF — turning marketing back on happens from the
 * in-app settings screen so we never re-opt someone in from a URL.
 */
@Controller('api/email')
export class EmailUnsubscribeController {
  private readonly logger = new Logger(EmailUnsubscribeController.name);

  constructor(
    private tokens: UnsubscribeTokenService,
    private prisma: PrismaService,
  ) {}

  @Get('unsubscribe')
  async unsubscribe(@Query('t') token: string, @Res() res: Response) {
    if (!token) return res.status(400).send(html('Enlace inválido.'));
    const decoded = this.tokens.verify(token);
    if (!decoded)
      return res.status(400).send(html('Enlace inválido o expirado.'));

    const data =
      decoded.key === 'notifMarketing'
        ? { notifMarketing: false }
        : decoded.key === 'notifOffers'
          ? { notifOffers: false }
          : null;
    if (!data) return res.status(400).send(html('Preferencia desconocida.'));

    try {
      await this.prisma.user.update({ where: { id: decoded.userId }, data });
    } catch (e: any) {
      this.logger.warn(
        `Unsubscribe failed for user ${decoded.userId}: ${e?.message}`,
      );
    }

    return res.send(
      html(
        'Hemos actualizado tus preferencias. No recibirás más emails de esta categoría.',
      ),
    );
  }
}

function html(msg: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Bomelh</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;background:#f5f5f5;margin:0;padding:40px 16px;color:#111827"><div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;text-align:center"><h1 style="color:#004940;margin:0 0 12px">Bomelh</h1><p style="font-size:15px;line-height:1.5;color:#374151">${msg}</p></div></body></html>`;
}
