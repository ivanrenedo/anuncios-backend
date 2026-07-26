import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Twilio } from 'twilio';

@Injectable()
export class SmsService {
  private client: Twilio;
  private from: string;
  private readonly logger = new Logger(SmsService.name);

  constructor(config: ConfigService) {
    const sid = config.get<string>('TWILIO_ACCOUNT_SID');
    const token = config.get<string>('TWILIO_AUTH_TOKEN');
    this.from = config.get<string>('TWILIO_PHONE_NUMBER') || '';

    if (sid && token) {
      this.client = new Twilio(sid, token);
    }
  }

  async sendOtp(phone: string, code: string): Promise<void> {
    if (!this.client) {
      this.logger.warn(`[DEV] OTP SMS para ${phone}: ${code}`);
      return;
    }

    await this.client.messages.create({
      body: `Tu código de verificación de Bomelh es: ${code}. Expira en 5 minutos.`,
      from: this.from,
      to: phone,
    });
  }
}
