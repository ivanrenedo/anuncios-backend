import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class OtpEmailService {
  private transporter: nodemailer.Transporter | null = null;
  private from: string;
  private readonly logger = new Logger(OtpEmailService.name);

  constructor(private config: ConfigService) {
    const user = config.get<string>('SMTP_USER');
    const pass = config.get<string>('SMTP_PASS');
    this.from = user || '';

    if (user && pass) {
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user, pass },
      });
    }
  }

  async sendOtp(email: string, code: string): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(`[DEV] OTP Email para ${email}: ${code}`);
      return;
    }

    await this.transporter.sendMail({
      from: `"Market EG" <${this.from}>`,
      to: email,
      subject: 'Código de verificación - Market EG',
      html: `
        <div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:24px">
          <h2 style="color:#333">Código de verificación</h2>
          <p style="font-size:32px;letter-spacing:8px;font-weight:bold;text-align:center;
                    background:#f5f5f5;padding:16px;border-radius:8px">${code}</p>
          <p style="color:#666">Este código expira en 5 minutos.</p>
          <p style="color:#999;font-size:12px">Si no solicitaste este código, ignora este mensaje.</p>
        </div>
      `,
    });
  }
}
