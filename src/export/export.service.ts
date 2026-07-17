import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { csvRow, UTF8_BOM, type CsvCell } from './csv.helper';

export type ExportModel =
  | 'users'
  | 'products'
  | 'payments'
  | 'reports'
  | 'reviews'
  | 'verifications'
  | 'admin-actions'
  | 'plan-changes';

export interface DateRange {
  from?: Date;
  to?: Date;
}

// Rows-per-fetch: big enough that the per-batch query overhead is amortised,
// small enough that each batch is a modest RAM footprint.
const BATCH_SIZE = 1000;

/**
 * Streams a CSV per model to the response, cursor-paginated so memory stays
 * flat regardless of table size. Each model has its own header + row shaper.
 */
@Injectable()
export class ExportService {
  constructor(private prisma: PrismaService) {}

  async stream(model: ExportModel, range: DateRange, res: Response): Promise<number> {
    res.write(UTF8_BOM);
    switch (model) {
      case 'users':
        return this.streamUsers(range, res);
      case 'products':
        return this.streamProducts(range, res);
      case 'payments':
        return this.streamPayments(range, res);
      case 'reports':
        return this.streamReports(range, res);
      case 'reviews':
        return this.streamReviews(range, res);
      case 'verifications':
        return this.streamVerifications(range, res);
      case 'admin-actions':
        return this.streamAdminActions(range, res);
      case 'plan-changes':
        return this.streamPlanChanges(range, res);
    }
  }

  private dateFilter(range: DateRange): Prisma.DateTimeFilter | undefined {
    if (!range.from && !range.to) return undefined;
    const filter: Prisma.DateTimeFilter = {};
    if (range.from) filter.gte = range.from;
    if (range.to) filter.lte = range.to;
    return filter;
  }

  /**
   * Generic cursor loop that writes headers, then walks the table in
   * `BATCH_SIZE` chunks writing each row through `shape`. Returns total rows.
   */
  private async streamBatched<T extends { id: string }>(
    res: Response,
    headers: string[],
    fetchBatch: (cursor: string | null) => Promise<T[]>,
    shape: (row: T) => CsvCell[],
  ): Promise<number> {
    res.write(csvRow(headers));
    let cursor: string | null = null;
    let total = 0;
    while (true) {
      const batch = await fetchBatch(cursor);
      if (batch.length === 0) break;
      for (const row of batch) res.write(csvRow(shape(row)));
      total += batch.length;
      if (batch.length < BATCH_SIZE) break;
      cursor = batch[batch.length - 1].id;
    }
    return total;
  }

  private streamUsers(range: DateRange, res: Response) {
    const createdAt = this.dateFilter(range);
    return this.streamBatched(
      res,
      ['id', 'name', 'email', 'phone', 'plan', 'planExpiresAt', 'verified', 'suspended', 'createdAt'],
      (cursor) =>
        this.prisma.user.findMany({
          where: { ...(createdAt ? { createdAt } : {}) },
          orderBy: { id: 'asc' },
          take: BATCH_SIZE,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        }),
      (u) => [
        u.id,
        u.name,
        u.email,
        u.phone,
        u.plan,
        u.planExpiresAt,
        u.verified,
        u.suspended,
        u.createdAt,
      ],
    );
  }

  private streamProducts(range: DateRange, res: Response) {
    const createdAt = this.dateFilter(range);
    return this.streamBatched(
      res,
      [
        'id',
        'title',
        'price',
        'discount',
        'condition',
        'city',
        'status',
        'views',
        'favoritesCount',
        'contacts',
        'categoryLabel',
        'sellerName',
        'sellerEmail',
        'createdAt',
      ],
      (cursor) =>
        this.prisma.product.findMany({
          where: { ...(createdAt ? { createdAt } : {}) },
          include: { category: true, seller: true },
          orderBy: { id: 'asc' },
          take: BATCH_SIZE,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        }),
      (p: any) => [
        p.id,
        p.title,
        p.price?.toString(),
        p.discount,
        p.condition,
        p.city,
        p.status,
        p.views,
        p.favoritesCount,
        p.contacts,
        p.category?.label,
        p.seller?.name,
        p.seller?.email,
        p.createdAt,
      ],
    );
  }

  private streamPayments(range: DateRange, res: Response) {
    const createdAt = this.dateFilter(range);
    return this.streamBatched(
      res,
      [
        'id',
        'amount',
        'currency',
        'concept',
        'note',
        'productId',
        'userName',
        'userEmail',
        'createdByName',
        'createdAt',
      ],
      (cursor) =>
        this.prisma.payment.findMany({
          where: { ...(createdAt ? { createdAt } : {}) },
          include: { user: true, createdBy: true },
          orderBy: { id: 'asc' },
          take: BATCH_SIZE,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        }),
      (p: any) => [
        p.id,
        p.amount?.toString(),
        p.currency,
        p.concept,
        p.note,
        p.productId,
        p.user?.name,
        p.user?.email,
        p.createdBy?.name,
        p.createdAt,
      ],
    );
  }

  private streamReports(range: DateRange, res: Response) {
    const createdAt = this.dateFilter(range);
    return this.streamBatched(
      res,
      [
        'id',
        'type',
        'reason',
        'status',
        'reporterEmail',
        'reportedUserEmail',
        'productId',
        'description',
        'reviewedByEmail',
        'reviewedAt',
        'resolutionNote',
        'createdAt',
      ],
      (cursor) =>
        this.prisma.report.findMany({
          where: { ...(createdAt ? { createdAt } : {}) },
          include: { reporter: true, reportedUser: true, reviewedBy: true },
          orderBy: { id: 'asc' },
          take: BATCH_SIZE,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        }),
      (r: any) => [
        r.id,
        r.type,
        r.reason,
        r.status,
        r.reporter?.email,
        r.reportedUser?.email,
        r.productId,
        r.description,
        r.reviewedBy?.email,
        r.reviewedAt,
        r.resolutionNote,
        r.createdAt,
      ],
    );
  }

  private streamReviews(range: DateRange, res: Response) {
    const createdAt = this.dateFilter(range);
    return this.streamBatched(
      res,
      ['id', 'rating', 'text', 'authorEmail', 'sellerEmail', 'createdAt'],
      (cursor) =>
        this.prisma.review.findMany({
          where: { ...(createdAt ? { createdAt } : {}) },
          include: { author: true, seller: true },
          orderBy: { id: 'asc' },
          take: BATCH_SIZE,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        }),
      (r: any) => [
        r.id,
        r.rating,
        r.text,
        r.author?.email,
        r.seller?.email,
        r.createdAt,
      ],
    );
  }

  private streamVerifications(range: DateRange, res: Response) {
    const createdAt = this.dateFilter(range);
    return this.streamBatched(
      res,
      [
        'id',
        'userEmail',
        'status',
        'rejectedReason',
        'reviewedByEmail',
        'reviewedAt',
        'createdAt',
      ],
      (cursor) =>
        this.prisma.verificationRequest.findMany({
          where: { ...(createdAt ? { createdAt } : {}) },
          include: { user: true, reviewedBy: true },
          orderBy: { id: 'asc' },
          take: BATCH_SIZE,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        }),
      (v: any) => [
        v.id,
        v.user?.email,
        v.status,
        v.rejectedReason,
        v.reviewedBy?.email,
        v.reviewedAt,
        v.createdAt,
      ],
    );
  }

  private streamAdminActions(range: DateRange, res: Response) {
    const createdAt = this.dateFilter(range);
    return this.streamBatched(
      res,
      ['id', 'adminName', 'adminEmail', 'action', 'targetType', 'targetId', 'detail', 'createdAt'],
      (cursor) =>
        this.prisma.adminAction.findMany({
          where: { ...(createdAt ? { createdAt } : {}) },
          include: { admin: true },
          orderBy: { id: 'asc' },
          take: BATCH_SIZE,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        }),
      (a: any) => [
        a.id,
        a.admin?.name,
        a.admin?.email,
        a.action,
        a.targetType,
        a.targetId,
        a.detail,
        a.createdAt,
      ],
    );
  }

  private streamPlanChanges(range: DateRange, res: Response) {
    const createdAt = this.dateFilter(range);
    return this.streamBatched(
      res,
      [
        'id',
        'userEmail',
        'oldPlan',
        'newPlan',
        'expiresAt',
        'reason',
        'changedByEmail',
        'createdAt',
      ],
      (cursor) =>
        this.prisma.planChange.findMany({
          where: { ...(createdAt ? { createdAt } : {}) },
          include: { user: true, changedBy: true },
          orderBy: { id: 'asc' },
          take: BATCH_SIZE,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        }),
      (c: any) => [
        c.id,
        c.user?.email,
        c.oldPlan,
        c.newPlan,
        c.expiresAt,
        c.reason,
        c.changedBy?.email,
        c.createdAt,
      ],
    );
  }
}
