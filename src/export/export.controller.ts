import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { ExportService, type ExportModel } from './export.service';
import { AdminGuard } from '../auth/guards/admin.guard';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';
import { AuditService } from '../audit/audit.service';

function parseDate(value: string | undefined, label: 'from' | 'to'): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException(`Parámetro '${label}' inválido`);
  }
  return d;
}

/**
 * Streams CSV exports for the admin panel. Every download is audited so we
 * have a trail of who pulled which PII/financial dataset. The heavy models
 * (payments, admin-actions) require SUPER_ADMIN on top of AdminGuard.
 *
 * Rate limit: 5 downloads per minute per IP, tighter than the app-wide 120/min.
 * CSV exports stream the full dataset and are network/DB expensive — a runaway
 * script or admin double-clicking on the button could drag Postgres down.
 */
@Controller('export')
@Throttle({ default: { limit: 5, ttl: 60_000 } })
export class ExportController {
  constructor(
    private service: ExportService,
    private audit: AuditService,
  ) {}

  @Get('users.csv')
  @UseGuards(AdminGuard)
  users(@Req() req: Request, @Res() res: Response, @Query('from') from?: string, @Query('to') to?: string) {
    return this.download('users', req, res, from, to);
  }

  @Get('products.csv')
  @UseGuards(AdminGuard)
  products(@Req() req: Request, @Res() res: Response, @Query('from') from?: string, @Query('to') to?: string) {
    return this.download('products', req, res, from, to);
  }

  @Get('payments.csv')
  @UseGuards(AdminGuard, SuperAdminGuard)
  payments(@Req() req: Request, @Res() res: Response, @Query('from') from?: string, @Query('to') to?: string) {
    return this.download('payments', req, res, from, to);
  }

  @Get('reports.csv')
  @UseGuards(AdminGuard)
  reports(@Req() req: Request, @Res() res: Response, @Query('from') from?: string, @Query('to') to?: string) {
    return this.download('reports', req, res, from, to);
  }

  @Get('reviews.csv')
  @UseGuards(AdminGuard)
  reviews(@Req() req: Request, @Res() res: Response, @Query('from') from?: string, @Query('to') to?: string) {
    return this.download('reviews', req, res, from, to);
  }

  @Get('verifications.csv')
  @UseGuards(AdminGuard)
  verifications(@Req() req: Request, @Res() res: Response, @Query('from') from?: string, @Query('to') to?: string) {
    return this.download('verifications', req, res, from, to);
  }

  @Get('admin-actions.csv')
  @UseGuards(AdminGuard, SuperAdminGuard)
  adminActions(@Req() req: Request, @Res() res: Response, @Query('from') from?: string, @Query('to') to?: string) {
    return this.download('admin-actions', req, res, from, to);
  }

  @Get('plan-changes.csv')
  @UseGuards(AdminGuard)
  planChanges(@Req() req: Request, @Res() res: Response, @Query('from') from?: string, @Query('to') to?: string) {
    return this.download('plan-changes', req, res, from, to);
  }

  private async download(
    model: ExportModel,
    req: Request,
    res: Response,
    from?: string,
    to?: string,
  ) {
    const range = { from: parseDate(from, 'from'), to: parseDate(to, 'to') };
    const filename = `${model}-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const rows = await this.service.stream(model, range, res);
    res.end();

    const adminId = (req as any).user?.id as string | undefined;
    const parts: string[] = [`rows=${rows}`];
    if (range.from) parts.push(`from=${range.from.toISOString()}`);
    if (range.to) parts.push(`to=${range.to.toISOString()}`);
    this.audit.log(adminId, `export_${model.replace(/-/g, '_')}`, 'system', model, parts.join(' '));
  }
}
