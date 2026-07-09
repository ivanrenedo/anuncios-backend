import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface SuggestionCandidate {
  type: string;
  title: string;
  reason: string;
  filter: any;
  score: number;
}

@Injectable()
export class StatsAnalyzerService {
  private readonly logger = new Logger(StatsAnalyzerService.name);

  constructor(private prisma: PrismaService) {}

  async generateSuggestions(): Promise<number> {
    const candidates: SuggestionCandidate[] = [];

    const [trending, topFavorited, discountOps, hotCategories] =
      await Promise.all([
        this.detectTrendingCategories(),
        this.detectTopFavorited(),
        this.detectDiscountOpportunities(),
        this.detectHotCategories(),
      ]);

    candidates.push(...trending, ...topFavorited, ...discountOps, ...hotCategories);

    const existing = await this.prisma.homeSuggestion.findMany({
      where: { status: 'pending' },
      select: { title: true },
    });
    const existingTitles = new Set(existing.map((s) => s.title));

    const activeSections = await this.prisma.homeSection.findMany({
      select: { title: true },
    });
    const activeTitles = new Set(activeSections.map((s) => s.title));

    const fresh = candidates.filter(
      (c) => !existingTitles.has(c.title) && !activeTitles.has(c.title),
    );

    if (fresh.length === 0) return 0;

    await this.prisma.homeSuggestion.createMany({
      data: fresh.map((c) => ({
        type: c.type,
        title: c.title,
        reason: c.reason,
        filter: c.filter,
        score: c.score,
      })),
    });

    this.logger.log(`Generated ${fresh.length} new suggestions`);
    return fresh.length;
  }

  private async detectTrendingCategories(): Promise<SuggestionCandidate[]> {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const views = await this.prisma.productView.groupBy({
      by: ['productId'],
      where: { viewedAt: { gte: weekAgo } },
      _count: true,
      orderBy: { _count: { productId: 'desc' } },
      take: 100,
    });

    if (views.length === 0) return [];

    const productIds = views.map((v) => v.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, status: 'active' },
      select: { categoryId: true, category: { select: { label: true, slug: true } } },
    });

    const catCounts = new Map<string, { count: number; label: string; slug: string }>();
    for (const p of products) {
      const cur = catCounts.get(p.categoryId) || { count: 0, label: p.category.label, slug: p.category.slug };
      cur.count++;
      catCounts.set(p.categoryId, cur);
    }

    const suggestions: SuggestionCandidate[] = [];
    for (const [, data] of catCounts) {
      if (data.count >= 5) {
        suggestions.push({
          type: 'product_rail',
          title: `Tendencia: ${data.label}`,
          reason: `${data.count} productos con muchas views esta semana en ${data.label}`,
          filter: {
            sortBy: 'views',
            order: 'desc',
            timeRange: '7d',
            categorySlug: data.slug,
            limit: 10,
          },
          score: Math.min(data.count / 10, 1),
        });
      }
    }

    return suggestions;
  }

  private async detectTopFavorited(): Promise<SuggestionCandidate[]> {
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const topFav = await this.prisma.product.findMany({
      where: {
        status: 'active',
        createdAt: { gte: monthAgo },
        favoritesCount: { gte: 5 },
      },
      orderBy: { favoritesCount: 'desc' },
      take: 20,
      select: { favoritesCount: true },
    });

    if (topFav.length < 5) return [];

    return [
      {
        type: 'product_rail',
        title: 'Más favoritos del mes',
        reason: `${topFav.length} productos con 5+ favoritos en los últimos 30 días`,
        filter: {
          sortBy: 'favoritesCount',
          order: 'desc',
          timeRange: '30d',
          limit: 10,
        },
        score: Math.min(topFav.length / 20, 1),
      },
    ];
  }

  private async detectDiscountOpportunities(): Promise<SuggestionCandidate[]> {
    const withDiscount = await this.prisma.product.count({
      where: { status: 'active', discount: { gte: 20 } },
    });

    if (withDiscount < 3) return [];

    return [
      {
        type: 'product_rail',
        title: 'Ofertas destacadas',
        reason: `${withDiscount} productos con descuento ≥20% activos ahora`,
        filter: {
          sortBy: 'discount',
          order: 'desc',
          where: { discount: { gte: 20 } },
          limit: 10,
        },
        score: Math.min(withDiscount / 15, 1),
      },
    ];
  }

  private async detectHotCategories(): Promise<SuggestionCandidate[]> {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const recentByCategory = await this.prisma.product.groupBy({
      by: ['categoryId'],
      where: { status: 'active', createdAt: { gte: weekAgo } },
      _count: true,
      orderBy: { _count: { categoryId: 'desc' } },
      take: 5,
    });

    const suggestions: SuggestionCandidate[] = [];
    for (const group of recentByCategory) {
      if (group._count < 8) continue;

      const cat = await this.prisma.category.findUnique({
        where: { id: group.categoryId },
        select: { label: true, slug: true },
      });
      if (!cat) continue;

      suggestions.push({
        type: 'product_rail',
        title: `Nuevo en ${cat.label}`,
        reason: `${group._count} productos nuevos esta semana en ${cat.label}`,
        filter: {
          sortBy: 'createdAt',
          order: 'desc',
          categorySlug: cat.slug,
          limit: 10,
        },
        score: Math.min(group._count / 15, 1),
      });
    }

    return suggestions;
  }
}
