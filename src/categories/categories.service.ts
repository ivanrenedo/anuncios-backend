import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryInput } from './dto/create-category.input';
import { UpdateCategoryInput } from './dto/update-category.input';

// `Category` maps to the self-referential `menus` table: every row is a node in
// the category tree (parentId === null means a top-level/root category).
const NODE_INCLUDE = {
  parent: true,
  children: { orderBy: { sortOrder: 'asc' as const } },
};

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.category.findMany({
      include: NODE_INCLUDE,
      orderBy: { sortOrder: 'asc' },
    });
  }

  /**
   * Top-level categories with their nested descendants.
   * Replaces the old `classifications` tree query.
   */
  async findRoots() {
    return this.prisma.category.findMany({
      where: { parentId: null },
      orderBy: { sortOrder: 'asc' },
      include: {
        children: {
          orderBy: { sortOrder: 'asc' },
          include: { children: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });
  }

  async findOne(id: string) {
    const item = await this.prisma.category.findUnique({
      where: { id },
      include: NODE_INCLUDE,
    });
    if (!item) throw new NotFoundException('Categoría no encontrada');
    return item;
  }

  async findBySlug(slug: string) {
    const item = await this.prisma.category.findUnique({
      where: { slug },
      include: NODE_INCLUDE,
    });
    if (!item) throw new NotFoundException('Categoría no encontrada');
    return item;
  }

  /** Direct children of a category. Replaces `subcategoriesByCategory`. */
  async findChildren(parentId: string) {
    return this.prisma.category.findMany({
      where: { parentId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async create(data: CreateCategoryInput) {
    return this.prisma.category.create({
      data,
      include: NODE_INCLUDE,
    });
  }

  async update(id: string, data: UpdateCategoryInput) {
    return this.prisma.category.update({
      where: { id },
      data,
      include: NODE_INCLUDE,
    });
  }

  async remove(id: string) {
    return this.prisma.category.delete({ where: { id } });
  }
}
