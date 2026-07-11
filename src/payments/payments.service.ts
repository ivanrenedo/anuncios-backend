import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PaymentsService {
  constructor(private prisma: PrismaService) {}

  async findAll(take = 200, skip = 0) {
    return this.prisma.payment.findMany({
      include: { user: true, createdBy: true },
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    });
  }

  /** Corrections only — the ledger is otherwise append-only. */
  async remove(id: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment) throw new NotFoundException('Pago no encontrado');
    return this.prisma.payment.delete({ where: { id } });
  }
}
