import { Injectable, Logger } from '@nestjs/common';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { PrismaService } from '../prisma/prisma.service';

interface PushPayload {
  title: string;
  body?: string;
  data?: Record<string, unknown>;
}

/**
 * Delivers push notifications through the Expo Push Service. Token bookkeeping
 * (register/prune) lives here too so the rest of the app only deals with
 * "notify this user" semantics.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly expo = new Expo();

  constructor(private prisma: PrismaService) {}

  /** Save (or re-point) a device token. Tokens are unique per device. */
  async registerToken(userId: string, token: string, platform?: string) {
    if (!Expo.isExpoPushToken(token)) {
      this.logger.warn(`Ignoring invalid Expo push token for user ${userId}`);
      return null;
    }
    return this.prisma.pushToken.upsert({
      where: { token },
      update: { userId, platform },
      create: { userId, token, platform },
    });
  }

  async removeToken(token: string) {
    await this.prisma.pushToken.deleteMany({ where: { token } });
    return true;
  }

  /**
   * Best-effort push to every device a user has registered. Never throws:
   * a failed push must not break the in-app notification that triggered it.
   */
  async sendToUser(userId: string, payload: PushPayload) {
    try {
      const rows = await this.prisma.pushToken.findMany({ where: { userId } });
      const tokens = rows
        .map((r) => r.token)
        .filter((t) => Expo.isExpoPushToken(t));
      this.logger.log(
        `sendToUser user=${userId} rows=${rows.length} validTokens=${tokens.length} title="${payload.title}"`,
      );
      if (tokens.length === 0) return;

      const messages: ExpoPushMessage[] = tokens.map((to) => ({
        to,
        sound: 'default',
        title: payload.title,
        body: payload.body ?? '',
        data: payload.data ?? {},
      }));

      const chunks = this.expo.chunkPushNotifications(messages);
      for (const chunk of chunks) {
        try {
          const tickets = await this.expo.sendPushNotificationsAsync(chunk);
          tickets.forEach((ticket, i) => {
            if (ticket.status === 'error') {
              this.logger.warn(
                `Expo ticket error to=${chunk[i].to} code=${ticket.details?.error ?? '?'} msg=${ticket.message ?? '?'}`,
              );
              if (ticket.details?.error === 'DeviceNotRegistered') {
                void this.removeToken(chunk[i].to as string);
              }
            } else {
              this.logger.log(`Expo ticket ok id=${ticket.id}`);
            }
          });
        } catch (err: any) {
          const msg = err?.cause?.code ?? err?.message ?? 'unknown';
          this.logger.warn(`Push chunk skipped (${msg})`);
        }
      }
    } catch (err: any) {
      this.logger.warn(`sendToUser skipped: ${err?.message ?? 'unknown'}`);
    }
  }
}
