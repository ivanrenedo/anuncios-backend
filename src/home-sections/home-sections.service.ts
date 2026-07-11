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

    const premiumProducts = await this.resolvePremiumShowcase();
    if (premiumProducts.length > 0) {
      const insertIdx = result.findIndex(
        (s) => s.type === 'product_rail' || s.type === 'product_grid',
      );
      const premiumSection = {
        id: '__premium_showcase__',
        type: 'premium_showcase',
        title: 'Tiendas Premium',
        subtitle: 'Productos de vendedores Premium',
        icon: 'crown',
        filter: null,
        config: null,
        sortOrder: -1,
        products: premiumProducts,
      };
      if (insertIdx >= 0) {
        result.splice(insertIdx, 0, premiumSection);
      } else {
        result.push(premiumSection);
      }
    }

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
    const views = await this.prisma.productView.findMany({
      where: { viewerKey },
      orderBy: { viewedAt: 'desc' },
      take: 10,
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
    return views.map((v) => v.product).filter((p) => p.status === 'active');
  }

  private async resolvePremiumShowcase() {
    const now = new Date();
    const include = {
      images: { take: 1, orderBy: { sortOrder: 'asc' as const } },
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
      propertyDetail: true,
      serviceDetail: true,
      vehicleDetail: true,
    };
    const planWhere = (plan: 'PREMIUM' | 'STAR'): Prisma.ProductWhereInput => ({
      status: 'active',
      seller: {
        plan,
        OR: [{ planExpiresAt: null }, { planExpiresAt: { gt: now } }],
      },
    });

    // PREMIUM gets priority; STAR gets the occasional slots promised by its plan.
    const [premium, star] = await Promise.all([
      this.prisma.product.findMany({
        where: planWhere('PREMIUM'),
        orderBy: { createdAt: 'desc' },
        take: 12,
        include,
      }),
      this.prisma.product.findMany({
        where: planWhere('STAR'),
        orderBy: { createdAt: 'desc' },
        take: 3,
        include,
      }),
    ]);

    // Interleave STAR items among the PREMIUM ones (1 STAR every 4 PREMIUM)
    // so they appear inside the rail rather than tacked on at the end.
    const result: typeof premium = [];
    let s = 0;
    for (let i = 0; i < premium.length; i++) {
      result.push(premium[i]);
      if ((i + 1) % 4 === 0 && s < star.length) result.push(star[s++]);
    }
    while (s < star.length) result.push(star[s++]);
    return result;
  }

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
            body: section.subtitle || `Descubre lo nuevo en Market EG`,
          }),
        ),
      );
    }
  }
}
