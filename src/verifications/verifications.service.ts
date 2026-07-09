import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const INCLUDE = {
  user: true,
  reviewedBy: true,
};

@Injectable()
export class VerificationsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async requestVerification(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado.');

    if (user.verified)
      throw new BadRequestException('Tu cuenta ya está verificada.');

    const existing = await this.prisma.verificationRequest.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    if (existing?.status === 'pending')
      throw new BadRequestException('Ya tienes una solicitud pendiente.');

    if (existing?.status === 'rejected' && existing.reviewedAt) {
      const daysSince = (Date.now() - new Date(existing.reviewedAt).getTime()) / 86_400_000;
      if (daysSince < 7)
        throw new BadRequestException(
          `Debes esperar ${Math.ceil(7 - daysSince)} día(s) para volver a solicitar la verificación.`,
        );
    }

    if (!user.phone)
      throw new BadRequestException('Debes verificar tu teléfono antes de solicitar la verificación.');
    if (!user.email)
      throw new BadRequestException('Debes confirmar tu email antes de solicitar la verificación.');
    if (!user.avatarUrl)
      throw new BadRequestException('Debes subir una foto de perfil antes de solicitar la verificación.');
    if (!user.name || user.name.trim().length < 3)
      throw new BadRequestException('Debes completar tu nombre antes de solicitar la verificación.');

    return this.prisma.verificationRequest.create({
      data: { userId },
      include: INCLUDE,
    });
  }

  async findAll() {
    return this.prisma.verificationRequest.findMany({
      include: INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByUser(userId: string) {
    return this.prisma.verificationRequest.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: INCLUDE,
    });
  }

  async approve(id: string, adminId: string) {
    const request = await this.prisma.verificationRequest.findUnique({
      where: { id },
    });
    if (!request) throw new NotFoundException('Solicitud no encontrada.');
    if (request.status !== 'pending')
      throw new BadRequestException('Esta solicitud ya fue procesada.');

    const [updated] = await this.prisma.$transaction([
      this.prisma.verificationRequest.update({
        where: { id },
        data: {
          status: 'approved',
          reviewedById: adminId,
          reviewedAt: new Date(),
        },
        include: INCLUDE,
      }),
      this.prisma.user.update({
        where: { id: request.userId },
        data: { verified: true },
      }),
    ]);

    await this.notifications.create({
      userId: request.userId,
      type: 'verified',
      title: '¡Cuenta verificada!',
      body: 'Tu solicitud de verificación ha sido aprobada. Ya tienes la insignia de verificado.',
    });

    return updated;
  }

  async deleteMany(ids: string[]) {
    await this.prisma.verificationRequest.deleteMany({
      where: { id: { in: ids } },
    });
  }

  async reject(id: string, adminId: string, reason?: string) {
    const request = await this.prisma.verificationRequest.findUnique({
      where: { id },
    });
    if (!request) throw new NotFoundException('Solicitud no encontrada.');
    if (request.status !== 'pending')
      throw new BadRequestException('Esta solicitud ya fue procesada.');

    const updated = await this.prisma.verificationRequest.update({
      where: { id },
      data: {
        status: 'rejected',
        rejectedReason: reason?.trim() || null,
        reviewedById: adminId,
        reviewedAt: new Date(),
      },
      include: INCLUDE,
    });

    await this.notifications.create({
      userId: request.userId,
      type: 'verified',
      title: 'Solicitud de verificación rechazada',
      body: reason?.trim()
        ? `Tu solicitud fue rechazada: ${reason.trim()}`
        : 'Tu solicitud de verificación ha sido rechazada. Revisa tu perfil e inténtalo de nuevo.',
    });

    return updated;
  }
}
