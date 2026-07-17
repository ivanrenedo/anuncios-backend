import {
  Injectable,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OtpChannel } from '@prisma/client';
import { randomInt } from 'crypto';

const OTP_EXPIRY_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const COOLDOWN_MS = 60 * 1000;
const MAX_CODES_PER_15MIN = 5;

@Injectable()
export class OtpService {
  constructor(private prisma: PrismaService) {}

  async generate(
    userId: string,
    channel: OtpChannel,
    target: string,
    purpose: string,
  ): Promise<string> {
    const now = new Date();

    const recentCount = await this.prisma.otpCode.count({
      where: {
        userId,
        purpose,
        createdAt: { gte: new Date(now.getTime() - COOLDOWN_MS) },
      },
    });
    if (recentCount >= 1) {
      throw new HttpException(
        'Debes esperar 1 minuto antes de solicitar otro código',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const last15min = await this.prisma.otpCode.count({
      where: {
        userId,
        purpose,
        createdAt: { gte: new Date(now.getTime() - 15 * 60 * 1000) },
      },
    });
    if (last15min >= MAX_CODES_PER_15MIN) {
      throw new HttpException(
        'Demasiadas solicitudes. Intenta de nuevo más tarde',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    await this.prisma.otpCode.updateMany({
      where: { userId, purpose, usedAt: null },
      data: { usedAt: now },
    });

    const code = randomInt(100000, 999999).toString();

    await this.prisma.otpCode.create({
      data: {
        userId,
        code,
        channel,
        target,
        purpose,
        expiresAt: new Date(now.getTime() + OTP_EXPIRY_MS),
      },
    });

    await this.prisma.otpCode.deleteMany({
      where: {
        userId,
        purpose,
        expiresAt: { lt: new Date(now.getTime() - 60 * 60 * 1000) },
      },
    });

    return code;
  }

  async verify(userId: string, purpose: string, code: string) {
    const otp = await this.prisma.otpCode.findFirst({
      where: { userId, purpose, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) {
      throw new BadRequestException(
        'No hay código pendiente. Solicita uno nuevo',
      );
    }

    if (otp.expiresAt < new Date()) {
      throw new BadRequestException('El código ha expirado');
    }

    if (otp.attempts >= MAX_ATTEMPTS) {
      throw new BadRequestException(
        'Demasiados intentos. Solicita un nuevo código',
      );
    }

    await this.prisma.otpCode.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });

    if (otp.code !== code) {
      throw new BadRequestException('Código incorrecto');
    }

    await this.prisma.otpCode.update({
      where: { id: otp.id },
      data: { usedAt: new Date() },
    });

    return otp;
  }
}
