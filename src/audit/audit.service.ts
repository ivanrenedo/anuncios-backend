import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Append-only audit trail of admin actions. `log` is fire-and-forget: an
 * audit failure must never break the action it records.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  log(
    adminId: string | null | undefined,
    action: string,
    targetType: 'product' | 'user' | 'payment' | 'system',
    targetId: string,
    detail?: string,
  ) {
    void this.prisma.adminAction
      .create({
        data: {
          adminId: adminId ?? null,
          action,
          targetType,
          targetId,
          detail: detail?.slice(0, 255) ?? null,
        },
      })
      .catch((e) => this.logger.warn(`audit log failed: ${e.message}`));
  }

  async findAll(take = 100, skip = 0) {
    return this.prisma.adminAction.findMany({
      include: { admin: true },
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    });
  }

  async deleteMany(ids: string[]) {
    if (!ids.length) return 0;
    const result = await this.prisma.adminAction.deleteMany({
      where: { id: { in: ids } },
    });
    return result.count;
  }
}
