import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateReportInput } from './dto/create-report.input';
import { ReportStatus, ReportType } from './dto/report.enums';

const REPORT_INCLUDE = {
  reporter: true,
  reportedUser: true,
  reviewedBy: true,
  product: { include: { images: true, seller: true } },
};

const RESOLVED_NOTIFICATION: Record<
  'reviewed' | 'dismissed',
  { title: string; body: string }
> = {
  reviewed: {
    title: 'Reporte revisado',
    body: 'Hemos revisado tu reporte y tomado las medidas oportunas. Gracias por ayudarnos a mantener Bomelh seguro.',
  },
  dismissed: {
    title: 'Reporte revisado',
    body: 'Hemos revisado tu reporte y no encontramos una infracción. Gracias por avisarnos.',
  },
};

@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async create(reporterId: string, input: CreateReportInput) {
    if (input.type === ReportType.product && !input.productId) {
      throw new BadRequestException(
        'Selecciona el anuncio que quieres reportar.',
      );
    }
    if (input.type === ReportType.user && !input.reportedUserId) {
      throw new BadRequestException(
        'Selecciona el usuario que quieres reportar.',
      );
    }
    if (input.type === ReportType.user && input.reportedUserId === reporterId) {
      throw new BadRequestException('No puedes reportarte a ti mismo.');
    }

    const data: any = {
      type: input.type,
      reason: input.reason,
      description: input.description?.trim() || null,
      reporterId,
      reportedUserId:
        input.type === ReportType.user ? input.reportedUserId : null,
      productId: input.type === ReportType.product ? input.productId : null,
    };

    return this.prisma.report.create({ data, include: REPORT_INCLUDE });
  }

  async findAll() {
    return this.prisma.report.findMany({
      include: REPORT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateStatus(
    id: string,
    status: ReportStatus,
    adminId: string,
    note?: string,
  ) {
    const current = await this.prisma.report.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Reporte no encontrado');

    const resolving =
      status === ReportStatus.reviewed || status === ReportStatus.dismissed;

    const data: any = {
      status,
      // Resolving stamps who/when + the internal note; reopening clears them.
      reviewedById: resolving ? adminId : null,
      reviewedAt: resolving ? new Date() : null,
      resolutionNote: resolving ? note?.trim() || null : null,
    };

    const report = await this.prisma.report.update({
      where: { id },
      data,
      include: REPORT_INCLUDE,
    });

    // Notify the reporter the first time the report is resolved.
    if (resolving && current.status === ReportStatus.pending) {
      const msg = RESOLVED_NOTIFICATION[status];
      await this.notifications.create({
        userId: current.reporterId,
        type: 'report',
        title: msg.title,
        body: msg.body,
        relatedProductId: current.productId ?? undefined,
        relatedUserId: current.reportedUserId ?? undefined,
      });
    }

    return report;
  }

  /** Admin: permanently delete one or more reports by id. Returns the count. */
  async deleteReports(ids: string[]) {
    const result = await this.prisma.report.deleteMany({
      where: { id: { in: ids } },
    });
    return result.count;
  }
}
