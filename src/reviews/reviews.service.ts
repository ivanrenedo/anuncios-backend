import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReviewInput } from './dto/create-review.input';
import { UpdateReviewInput } from './dto/update-review.input';
import { NotificationEvents } from '../notifications/notifications.events';

@Injectable()
export class ReviewsService {
  constructor(
    private prisma: PrismaService,
    private events: EventEmitter2,
  ) {}

  async findBySeller(sellerId: string) {
    return this.prisma.review.findMany({
      where: { sellerId },
      include: { author: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByAuthor(authorId: string) {
    return this.prisma.review.findMany({
      where: { authorId },
      include: { seller: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(authorId: string, input: CreateReviewInput) {
    if (authorId === input.sellerId) {
      throw new ForbiddenException('No puedes valorarte a ti mismo');
    }
    const review = await this.prisma.review.create({
      data: { ...input, authorId },
      include: { author: true, seller: true },
    });

    this.events.emit(NotificationEvents.ReviewCreated, {
      reviewId: review.id,
      rating: review.rating,
      authorId,
      authorName: review.author.name,
      sellerId: review.sellerId,
    });
    return review;
  }

  async update(id: string, authorId: string, input: UpdateReviewInput) {
    const review = await this.prisma.review.findUnique({ where: { id } });
    if (!review) throw new NotFoundException('Reseña no encontrada');
    if (review.authorId !== authorId)
      throw new ForbiddenException('No puedes editar esta reseña');
    return this.prisma.review.update({
      where: { id },
      data: { rating: input.rating, text: input.text ?? null },
      include: { author: true, seller: true },
    });
  }

  async remove(id: string, authorId: string) {
    const review = await this.prisma.review.findUnique({ where: { id } });
    if (!review) throw new NotFoundException('Reseña no encontrada');
    if (review.authorId !== authorId)
      throw new ForbiddenException('No puedes eliminar esta reseña');
    return this.prisma.review.delete({ where: { id } });
  }

  async getSellerRating(sellerId: string) {
    const result = await this.prisma.review.aggregate({
      where: { sellerId },
      _avg: { rating: true },
      _count: { rating: true },
    });
    return {
      average: result._avg.rating ?? 0,
      count: result._count.rating,
    };
  }

  /**
   * Top sellers ranked by average rating, resolved in a single grouped query
   * (replaces the dashboard's old N+1 of one sellerRating call per seller).
   * Ties break by review count so a 5★/1-review seller doesn't outrank a
   * 5★/50-review one.
   */
  async getTopRatedSellers(limit: number) {
    // Rank + limit in the database (groupBy only yields sellers that have
    // reviews); ties break by review count so a 5★/1-review seller doesn't
    // outrank a 5★/50-review one.
    const grouped = await this.prisma.review.groupBy({
      by: ['sellerId'],
      _avg: { rating: true },
      _count: { rating: true },
      orderBy: [{ _avg: { rating: 'desc' } }, { _count: { rating: 'desc' } }],
      take: limit,
    });
    if (grouped.length === 0) return [];

    const users = await this.prisma.user.findMany({
      where: { id: { in: grouped.map((g) => g.sellerId) } },
      select: { id: true, name: true },
    });
    const nameById = new Map(users.map((u) => [u.id, u.name]));
    return grouped.map((g) => ({
      sellerId: g.sellerId,
      name: nameById.get(g.sellerId) ?? '—',
      average: g._avg.rating ?? 0,
      count: g._count.rating,
    }));
  }

  /** Global rating stats for the admin dashboard. */
  async getStats() {
    const agg = await this.prisma.review.aggregate({
      _avg: { rating: true },
      _count: { rating: true },
    });
    const grouped = await this.prisma.review.groupBy({
      by: ['rating'],
      _count: { rating: true },
    });
    const distMap: Record<number, number> = {};
    for (const g of grouped) distMap[g.rating] = g._count.rating;
    const distribution = [5, 4, 3, 2, 1].map((stars) => ({
      stars,
      count: distMap[stars] ?? 0,
    }));
    return {
      average: agg._avg.rating ?? 0,
      count: agg._count.rating,
      distribution,
    };
  }
}
