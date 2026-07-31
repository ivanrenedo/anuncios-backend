import { PrismaClient } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ProductsService } from '../../src/products/products.service';
import { AuditService } from '../../src/audit/audit.service';
import { StorageService } from '../../src/upload/storage.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { newTestPrisma, truncateAll } from './prisma-test.helper';
import { makeUser, makeCategory, makeProduct } from './factories';

/**
 * End-to-end sanity of `ProductsService.search()` against a real Postgres.
 * Exercises the exact `matchingIdsByText` raw-SQL helper (with its
 * `immutable_unaccent`, ILIKE-anywhere, and the menu/subcategory rollup)
 * that unit mocks can't cover — the whole point is that Prisma really
 * roundtrips through Postgres with the right column names and search_path.
 */
describe('ProductsService.search (integration)', () => {
  let prisma: PrismaClient;
  let service: ProductsService;
  // Seeded fixture ids captured at the top of each test.
  let sellerId: string;
  let rootVehiculosId: string;
  let subCochesId: string;
  let rootModaId: string;
  let ferrariId: string;
  let toyotaId: string;
  let zapatosId: string;

  beforeAll(() => {
    prisma = newTestPrisma();
    // The service constructor expects a PrismaService but only uses it via
    // Prisma's public API — the test PrismaClient is a drop-in.
    service = new ProductsService(
      prisma as unknown as PrismaService,
      new EventEmitter2(),
      {} as AuditService, // never touched in search flow
      {} as StorageService, // idem
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma);

    // Categories: two roots + one subcategory under Vehiculos.
    const vehiculos = await makeCategory(prisma, { label: 'Vehiculos' });
    const coches = await makeCategory(prisma, {
      label: 'Coches',
      parentId: vehiculos.id,
    });
    const moda = await makeCategory(prisma, { label: 'Moda' });
    rootVehiculosId = vehiculos.id;
    subCochesId = coches.id;
    rootModaId = moda.id;

    const seller = await makeUser(prisma, {});
    sellerId = seller.id;

    const ferrari = await makeProduct(prisma, {
      sellerId,
      categoryId: subCochesId,
      title: 'Ferrari F40 rojo',
      description: 'clásico coleccionista',
    });
    const toyota = await makeProduct(prisma, {
      sellerId,
      categoryId: subCochesId,
      title: 'Toyota Hilux 2020',
      description: 'diesel',
    });
    const zapatos = await makeProduct(prisma, {
      sellerId,
      categoryId: rootModaId,
      title: 'Zapatos Nike Air Max',
      description: 'talla 42',
    });
    ferrariId = ferrari.id;
    toyotaId = toyota.id;
    zapatosId = zapatos.id;
  });

  it('matches by product title (basic)', async () => {
    const res = await service.search({ query: 'ferrari' });
    expect(res.map((p) => p.id)).toEqual([ferrariId]);
  });

  it('matches by subcategory label', async () => {
    // Both cars are under `Coches` — the search should return them (order by
    // bumpedAt desc, both created ~now so any order is fine here).
    const res = await service.search({ query: 'coches' });
    expect(res.map((p) => p.id).sort()).toEqual([ferrariId, toyotaId].sort());
  });

  it('matches by ROOT category label (walks parent chain)', async () => {
    // Products live under `Coches`, but searching `vehiculos` (the root) must
    // still return them — that's the whole subcategory rollup point.
    const res = await service.search({ query: 'vehiculos' });
    expect(res.map((p) => p.id).sort()).toEqual([ferrariId, toyotaId].sort());
  });

  it('is accent-insensitive (unaccent wrapper)', async () => {
    // No accent in input, accent-free label in DB — but the immutable_unaccent
    // wrapper on both sides is what proves the raw SQL actually resolves.
    const withAccent = await service.search({ query: 'vehículos' });
    const withoutAccent = await service.search({ query: 'vehiculos' });
    expect(withAccent.map((p) => p.id).sort()).toEqual(
      withoutAccent.map((p) => p.id).sort(),
    );
    expect(withAccent.length).toBeGreaterThan(0);
  });

  it('is case-insensitive', async () => {
    const upper = await service.search({ query: 'FERRARI' });
    const lower = await service.search({ query: 'ferrari' });
    expect(upper.map((p) => p.id)).toEqual(lower.map((p) => p.id));
  });

  it('matches from the description', async () => {
    const res = await service.search({ query: 'coleccionista' });
    expect(res.map((p) => p.id)).toEqual([ferrariId]);
  });

  it('excludes hidden products', async () => {
    // Flip zapatos to hide — search must not surface it even by exact title.
    await prisma.product.update({
      where: { id: zapatosId },
      data: { status: 'hide' },
    });
    const res = await service.search({ query: 'nike' });
    expect(res).toEqual([]);
  });

  it('combines text + explicit categoryId filter (AND semantics)', async () => {
    // Text "coches" alone matches Ferrari + Toyota.
    // Adding `categoryId = Moda` should intersect to zero — no car is in Moda.
    const res = await service.search({
      query: 'coches',
      categoryId: rootModaId,
    });
    expect(res).toEqual([]);
  });

  it('single-char query short-circuits (empty result via matchingIds)', async () => {
    // Helper guards on q.length < 2 to avoid degenerate LIKE '%%' scans.
    // With the empty prefilter, `where.id = { in: [] }` yields no products.
    const res = await service.search({ query: 'x' });
    expect(res).toEqual([]);
  });

  it('respects pagination (take/skip)', async () => {
    // Ferrari + Toyota under "coches" — take 1 skip 1 must return exactly one.
    const page1 = await service.search({ query: 'coches', take: 1, skip: 0 });
    const page2 = await service.search({ query: 'coches', take: 1, skip: 1 });
    expect(page1.length).toBe(1);
    expect(page2.length).toBe(1);
    expect(page1[0].id).not.toBe(page2[0].id);
  });

  it('no match returns empty (no crash on `id: { in: [] }`)', async () => {
    const res = await service.search({ query: 'xyzznot-a-thing-here' });
    // The trigram fallback fires when products.length < 5 but should still
    // find nothing for pure gibberish (similarity() < 0.25).
    expect(res).toEqual([]);
  });

  it('typo tolerance kicks in via trigram fallback', async () => {
    // "ferari" is a single-r typo — similarity() > 0.25, above the fallback
    // threshold in products.service. The exact ILIKE prefilter fails, so the
    // fallback (products.length < 5) is what surfaces Ferrari here.
    const res = await service.search({ query: 'ferari' });
    expect(res.map((p) => p.id)).toContain(ferrariId);
  });
});
