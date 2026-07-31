import { PrismaClient, Prisma } from '@prisma/client';
import { faker } from '@faker-js/faker';
import { hashPin } from '../../src/common/pin.util';

/**
 * Data factories for integration tests. Every factory:
 *  - fills every required column with sensible-random defaults
 *  - accepts partial overrides for the fields the test cares about
 *  - inserts into Postgres and returns the persisted row
 *
 * Naming reads at the call site: `await makeUser(prisma, { name: 'Alice' })`.
 */

export async function makeUser(
  prisma: PrismaClient,
  overrides: Partial<Prisma.UserCreateInput> = {},
) {
  return prisma.user.create({
    data: {
      name: faker.person.fullName(),
      email: faker.internet.email().toLowerCase(),
      pin: hashPin('246810'),
      permission: 'GRANTED',
      ...overrides,
    },
  });
}

export async function makeCategory(
  prisma: PrismaClient,
  overrides: {
    label?: string;
    slug?: string;
    parentId?: string | null;
    color?: string | null;
  } = {},
) {
  // Menus are the categories table. Slug must be unique — suffix with a
  // random tag so tests can create multiple categories without collision.
  const label = overrides.label ?? faker.commerce.department();
  const slug =
    overrides.slug ?? `${faker.helpers.slugify(label).toLowerCase()}-${faker.string.alphanumeric(6)}`;
  return prisma.category.create({
    data: {
      label,
      slug,
      color: overrides.color ?? null,
      parentId: overrides.parentId ?? null,
    },
  });
}

export async function makeProduct(
  prisma: PrismaClient,
  args: {
    sellerId: string;
    categoryId: string;
    title?: string;
    description?: string | null;
    price?: number;
    status?: 'active' | 'hide';
    city?: string | null;
  },
) {
  return prisma.product.create({
    data: {
      title: args.title ?? faker.commerce.productName(),
      description: args.description ?? faker.commerce.productDescription(),
      price: new Prisma.Decimal(args.price ?? faker.number.int({ min: 1000, max: 50000 })),
      status: args.status ?? 'active',
      city: args.city ?? faker.location.city(),
      seller: { connect: { id: args.sellerId } },
      category: { connect: { id: args.categoryId } },
    },
  });
}
