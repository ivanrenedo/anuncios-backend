import { Prisma } from '@prisma/client';

interface SectionFilter {
  sortBy?: string;
  order?: 'asc' | 'desc';
  limit?: number;
  timeRange?: string;
  categorySlug?: string;
  city?: string;
  where?: Record<string, any>;
}

const ALLOWED_SORT_FIELDS = [
  'views',
  'favoritesCount',
  'createdAt',
  'bumpedAt',
  'price',
  'discount',
];

const TIME_RANGE_MS: Record<string, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

export function buildProductQuery(
  filter: SectionFilter | null | undefined,
  opts?: { skipLimit?: boolean },
): Prisma.ProductFindManyArgs {
  if (!filter) return { where: { status: 'active' }, take: 10 };

  const where: Prisma.ProductWhereInput = { status: 'active' };

  if (filter.timeRange && TIME_RANGE_MS[filter.timeRange]) {
    where.createdAt = {
      gte: new Date(Date.now() - TIME_RANGE_MS[filter.timeRange]),
    };
  }

  if (filter.categorySlug) {
    where.category = { slug: filter.categorySlug };
  }

  if (filter.city) {
    where.city = { contains: filter.city, mode: 'insensitive' };
  }

  if (filter.where) {
    for (const [key, condition] of Object.entries(filter.where)) {
      if (key === 'discount' && typeof condition === 'object') {
        where.discount = condition;
      }
      if (key === 'price' && typeof condition === 'object') {
        where.price = condition;
      }
    }
  }

  const sortField =
    filter.sortBy && ALLOWED_SORT_FIELDS.includes(filter.sortBy)
      ? filter.sortBy
      : 'bumpedAt';
  const sortOrder = filter.order === 'asc' ? 'asc' : 'desc';

  const query: Prisma.ProductFindManyArgs = {
    where,
    orderBy: { [sortField]: sortOrder },
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
      propertyDetail: true,
      serviceDetail: true,
    },
  };

  if (!opts?.skipLimit) {
    query.take = Math.min(filter.limit ?? 10, 30);
  }

  return query;
}

export function isSectionActive(section: {
  visible: boolean;
  startsAt?: Date | null;
  endsAt?: Date | null;
}): boolean {
  if (!section.visible) return false;
  const now = new Date();
  if (section.startsAt && now < section.startsAt) return false;
  if (section.endsAt && now > section.endsAt) return false;
  return true;
}
