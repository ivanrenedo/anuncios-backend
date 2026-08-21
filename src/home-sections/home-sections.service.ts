import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CreateHomeSectionInput,
  UpdateHomeSectionInput,
} from './dto/create-home-section.input';
import { buildProductQuery, isSectionActive } from './filter-engine';

const SECTION_INCLUDE = { createdBy: true };

const NO_FILTER_TYPES = new Set(['banner', 'categories', 'recent_views']);

@Injectable()
export class HomeSectionsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async findAllAdmin() {
    return this.prisma.homeSection.findMany({
      include: SECTION_INCLUDE,
      orderBy: { sortOrder: 'asc' },
    });
  }

  async findPublic(viewerKey?: string) {
    const sections = await this.prisma.homeSection.findMany({
      include: SECTION_INCLUDE,
      orderBy: { sortOrder: 'asc' },
    });

    const active = sections.filter(isSectionActive);
    const result: any[] = [];

    for (const section of active) {
      if (section.type === 'recent_views') {
        const products = viewerKey
          ? await this.resolveRecentViews(viewerKey)
          : [];
        if (section.minResults > 0 && products.length < section.minResults)
          continue;
        result.push({ ...section, products });
        continue;
      }

      if (NO_FILTER_TYPES.has(section.type)) {
        result.push({ ...section, products: [] });
        continue;
      }

      const skipLimit = section.type === 'product_grid';
      const query = buildProductQuery(section.filter as any, { skipLimit });
      const products = await this.prisma.product.findMany(query);

      if (section.minResults > 0 && products.length < section.minResults)
        continue;

      result.push({ ...section, products });
    }

    // v2 Fase 12 — la sección sintética "Tiendas Premium" que aquí se
    // inyectaba (resolvePremiumShowcase) fue retirada porque duplicaba con
    // PremiumStoresRail del frontend/mobile, y además no respetaba el cap
    // 3-por-vendedor del briefing v2 (metía TODOS los productos Premium).
    // El rail v2 vive en el cliente y consume homeCarouselPremium con
    // fairness, cap y rotación diaria. resolvePremiumShowcase se mantiene
    // como código muerto por si algún día se quiere resucitar un fallback.

    return result;
  }

  async create(input: CreateHomeSectionInput, adminId: string) {
    if (input.sortOrder === undefined || input.sortOrder === 0) {
      const last = await this.prisma.homeSection.findFirst({
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      });
      input.sortOrder = (last?.sortOrder ?? 0) + 1;
    }

    const section = await this.prisma.homeSection.create({
      data: { ...input, createdById: adminId },
      include: SECTION_INCLUDE,
    });

    if (section.notifyOnCreate) {
      await this.broadcastSectionNotification(section);
    }

    return section;
  }

  async update(id: string, input: UpdateHomeSectionInput) {
    const current = await this.prisma.homeSection.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Sección no encontrada');

    return this.prisma.homeSection.update({
      where: { id },
      data: input,
      include: SECTION_INCLUDE,
    });
  }

  async delete(id: string) {
    const current = await this.prisma.homeSection.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Sección no encontrada');

    await this.prisma.homeSection.delete({ where: { id } });
    return true;
  }

  async reorder(ids: string[]) {
    await this.prisma.$transaction(
      ids.map((id, i) =>
        this.prisma.homeSection.update({
          where: { id },
          data: { sortOrder: i },
        }),
      ),
    );
    return this.findAllAdmin();
  }

  async previewFilterCount(filter: any): Promise<number> {
    const query = buildProductQuery(filter);
    return this.prisma.product.count({ where: query.where });
  }

  async trackEvent(sectionId: string, event: string, viewerKey: string) {
    await this.prisma.homeSectionEvent.create({
      data: { sectionId, event, viewerKey },
    });
    return true;
  }

  async getStats() {
    const sections = await this.prisma.homeSection.findMany({
      select: { id: true, title: true },
    });

    const stats = await Promise.all(
      sections.map(async (s) => {
        const [impressions, clicks] = await Promise.all([
          this.prisma.homeSectionEvent.count({
            where: { sectionId: s.id, event: 'impression' },
          }),
          this.prisma.homeSectionEvent.count({
            where: { sectionId: s.id, event: 'click' },
          }),
        ]);
        return {
          sectionId: s.id,
          impressions,
          clicks,
          ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
        };
      }),
    );

    return stats;
  }

  // --- Suggestions ---

  async findSuggestions() {
    return this.prisma.homeSuggestion.findMany({
      where: { status: 'pending' },
      orderBy: { score: 'desc' },
      include: { reviewedBy: true },
    });
  }

  async acceptSuggestion(id: string, adminId: string) {
    const suggestion = await this.prisma.homeSuggestion.findUnique({
      where: { id },
    });
    if (!suggestion) throw new NotFoundException('Sugerencia no encontrada');

    await this.prisma.homeSuggestion.update({
      where: { id },
      data: {
        status: 'accepted',
        reviewedById: adminId,
        reviewedAt: new Date(),
      },
    });

    const last = await this.prisma.homeSection.findFirst({
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    return this.prisma.homeSection.create({
      data: {
        type: 'product_rail',
        title: suggestion.title,
        icon: 'trending-up',
        filter: suggestion.filter,
        sortOrder: (last?.sortOrder ?? 0) + 1,
        visible: true,
        createdById: adminId,
      },
      include: SECTION_INCLUDE,
    });
  }

  async dismissSuggestion(id: string, adminId: string) {
    const suggestion = await this.prisma.homeSuggestion.findUnique({
      where: { id },
    });
    if (!suggestion) throw new NotFoundException('Sugerencia no encontrada');

    return this.prisma.homeSuggestion.update({
      where: { id },
      data: {
        status: 'dismissed',
        reviewedById: adminId,
        reviewedAt: new Date(),
      },
      include: { reviewedBy: true },
    });
  }

  async getSectionProducts(sectionId: string, take?: number, skip?: number) {
    const section = await this.prisma.homeSection.findUnique({
      where: { id: sectionId },
    });
    if (!section) throw new NotFoundException('Sección no encontrada');

    const query = buildProductQuery(section.filter as any);
    if (take) query.take = Math.min(take, 50);
    if (skip) query.skip = skip;
    return this.prisma.product.findMany(query);
  }

  async findFilterable() {
    const sections = await this.prisma.homeSection.findMany({
      where: {
        type: { in: ['product_rail', 'product_grid'] },
        filter: { not: Prisma.JsonNull },
      },
      orderBy: { sortOrder: 'asc' },
      include: SECTION_INCLUDE,
    });
    const now = new Date();
    return sections.filter((s) => {
      if (s.startsAt && now < s.startsAt) return false;
      if (s.endsAt && now > s.endsAt) return false;
      return true;
    });
  }

  // --- Private helpers ---

  private async resolveRecentViews(viewerKey: string) {
    // Pedimos un pool mayor que el objetivo (10) porque un viewer puede haber
    // abierto el mismo producto varias veces — cada apertura crea una fila
    // en `ProductView`, y sin dedupar el rail muestra duplicados y React
    // dispara "two children with the same key" al usar el productId como key.
    const TARGET = 10;
    const POOL = 40;
    const views = await this.prisma.productView.findMany({
      where: { viewerKey },
      orderBy: { viewedAt: 'desc' },
      take: POOL,
      include: {
        product: {
          include: {
            images: { take: 1, orderBy: { sortOrder: 'asc' } },
            seller: {
              select: {
                id: true,
                name: true,
                avatarUrl: true,
                verified: true,
                plan: true,
                planExpiresAt: true,
              },
            },
            category: { select: { id: true, label: true, slug: true } },
            vehicleDetail: true,
            propertyDetail: true,
            serviceDetail: true,
          },
        },
      },
    });

    const seen = new Set<string>();
    const unique: (typeof views)[number]['product'][] = [];
    for (const v of views) {
      const p = v.product;
      if (!p || p.status !== 'active' || seen.has(p.id)) continue;
      seen.add(p.id);
      unique.push(p);
      if (unique.length >= TARGET) break;
    }
    return unique;
  }

  // v2 Fase 12 — resolvePremiumShowcase eliminado. Duplicaba con
  // PremiumStoresRail (shop web + mobile) que consume homeCarouselPremium
  // con cap 3-por-vendedor y rotación diaria. La lógica antigua metía todos
  // los productos Premium+Star sin cap → violaba el briefing v2.

  private async broadcastSectionNotification(section: any) {
    const BATCH = 100;
    const users = await this.prisma.user.findMany({
      where: { notifMarketing: true },
      select: { id: true },
    });

    for (let i = 0; i < users.length; i += BATCH) {
      const batch = users.slice(i, i + BATCH);
      await Promise.all(
        batch.map((u) =>
          this.notifications.createForced({
            userId: u.id,
            type: 'marketing',
            title: section.title,
            body: section.subtitle || `Descubre lo nuevo en Bomelh`,
          }),
        ),
      );
    }
  }

  /**
   * v2 (Fase 5.4). Flattened, interleaved product list for the home "Tiendas
   * Premium" carousel. Reads today's `PremiumCarouselDay` rows (populated by
   * `PremiumCarouselCron`) and returns them round-robin so consecutive tiles
   * come from different sellers instead of clustering by vendor.
   *
   * Products whose status is no longer 'active' when the query runs are
   * dropped from the output — the cron caches ids, but visibility is
   * re-checked on read.
   */
  async premiumCarousel(take = 30) {
    const today = startOfUtcDay(new Date());
    const rows = await this.prisma.premiumCarouselDay.findMany({
      where: { day: today },
    });

    // v2 Fase 11.5 fallback: si el cron no corrió todavía para hoy (deploy
    // reciente, servidor recién arrancado, DST), computamos on-the-fly con
    // el mismo cap 3-por-vendedor. Sin persistir — es responsabilidad del
    // cron. Sin esto, el carrusel se vería vacío hasta el próximo tick del
    // cron a 00:00 GMT+1, lo que confunde a QA y al usuario final.
    let vendorProductIds: string[][];
    if (rows.length === 0) {
      const premiumUsers = await this.prisma.user.findMany({
        where: {
          plan: 'PREMIUM',
          suspended: false,
          OR: [
            { planExpiresAt: null },
            { planExpiresAt: { gt: new Date() } },
          ],
        },
        select: {
          id: true,
          products: {
            where: { status: 'active' },
            orderBy: { createdAt: 'desc' },
            take: 3, // v2 Fase 11.5 — cap 3 por vendedor incluso sin cron
            select: { id: true },
          },
        },
      });
      vendorProductIds = premiumUsers
        .map((u) => u.products.map((p) => p.id))
        .filter((ids) => ids.length > 0);
    } else {
      // Cap defensivo: la fila del cron ya viene con máximo 3, pero forzarlo
      // aquí protege contra migraciones futuras que ampliaran el pool sin
      // actualizar el consumidor.
      vendorProductIds = rows.map((r) => r.productIds.slice(0, 3));
    }

    const flatIds: string[] = interleaveByVendor(vendorProductIds).slice(
      0,
      take,
    );
    if (flatIds.length === 0) return [];

    const products = await this.prisma.product.findMany({
      where: { id: { in: flatIds }, status: 'active' },
      include: {
        seller: true,
        category: { include: { parent: true } },
        images: { orderBy: { sortOrder: 'asc' } },
      },
    });

    // Preserve the interleaved order — findMany returns unordered.
    const byId = new Map(products.map((p) => [p.id, p]));
    return flatIds
      .map((id) => byId.get(id))
      .filter((p): p is (typeof products)[number] => !!p);
  }
}

function startOfUtcDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

/**
 * Round-robin merge across N lists: takes the first item of every list, then
 * the second of every list, and so on. Empty slots collapse gracefully, so a
 * seller with fewer than the max products doesn't create gaps.
 */
function interleaveByVendor<T>(lists: T[][]): T[] {
  const maxLen = Math.max(0, ...lists.map((l) => l.length));
  const out: T[] = [];
  for (let i = 0; i < maxLen; i++) {
    for (const list of lists) {
      if (i < list.length) out.push(list[i]);
    }
  }
  return out;
}
