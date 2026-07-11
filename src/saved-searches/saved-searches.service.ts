import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSavedSearchInput } from './dto/create-saved-search.input';

const MAX_SAVED_SEARCHES = 10;

@Injectable()
export class SavedSearchesService {
  constructor(private prisma: PrismaService) {}

  async findByUser(userId: string) {
    return this.prisma.savedSearch.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Most-saved search terms — demand signal for the admin dashboard. */
  async termStats(limit = 20) {
    const rows = await this.prisma.savedSearch.groupBy({
      by: ['query'],
      where: { query: { not: null } },
      _count: { query: true },
      orderBy: { _count: { query: 'desc' } },
      take: limit,
    });
    return rows
      .filter((r) => r.query)
      .map((r) => ({ term: r.query as string, count: r._count.query }));
  }

  async create(userId: string, input: CreateSavedSearchInput) {
    const hasCriteria =
      (input.query && input.query.trim()) ||
      input.categoryId ||
      (input.city && input.city.trim()) ||
      input.priceMin != null ||
      input.priceMax != null;
    if (!hasCriteria) {
      throw new BadRequestException(
        'La búsqueda guardada necesita al menos un criterio.',
      );
    }

    const count = await this.prisma.savedSearch.count({ where: { userId } });
    if (count >= MAX_SAVED_SEARCHES) {
      throw new BadRequestException(
        `Puedes guardar un máximo de ${MAX_SAVED_SEARCHES} búsquedas. Elimina alguna para crear otra.`,
      );
    }

    return this.prisma.savedSearch.create({
      data: {
        userId,
        query: input.query?.trim() || null,
        categoryId: input.categoryId || null,
        city: input.city?.trim() || null,
        priceMin: input.priceMin ?? null,
        priceMax: input.priceMax ?? null,
      },
    });
  }

  async remove(userId: string, id: string) {
    const search = await this.prisma.savedSearch.findUnique({ where: { id } });
    if (!search) throw new NotFoundException('Búsqueda no encontrada');
    if (search.userId !== userId)
      throw new ForbiddenException(
        'No tienes permiso para eliminar esta búsqueda',
      );
    return this.prisma.savedSearch.delete({ where: { id } });
  }
}
