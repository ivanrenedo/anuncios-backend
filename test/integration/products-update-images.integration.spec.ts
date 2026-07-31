import { PrismaClient } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ProductsService } from '../../src/products/products.service';
import { AuditService } from '../../src/audit/audit.service';
import { StorageService } from '../../src/upload/storage.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { newTestPrisma, truncateAll } from './prisma-test.helper';
import { makeUser, makeCategory } from './factories';

/**
 * Pins the delete-only-what-changed contract of `products.update`:
 *   - drop image A, keep B, add C  →  storage.deleteFiles(['A'])
 *   - same images passed again      →  storage.deleteFiles NOT called
 * A regression here silently orphans upload files (dev sees nothing on the UI;
 * only the Spaces bill / disk grows over time).
 */
describe('ProductsService.update image-diff cleanup (integration)', () => {
  let prisma: PrismaClient;
  let service: ProductsService;
  let storageMock: jest.Mocked<Pick<StorageService, 'deleteFiles' | 'deleteFile'>>;
  let sellerId: string;
  let categoryId: string;

  beforeAll(() => {
    prisma = newTestPrisma();
    // The service constructor only calls the two mutation-side helpers of
    // storage — mock those and leave the S3 side alone.
    storageMock = {
      deleteFiles: jest.fn().mockResolvedValue(undefined),
      deleteFile: jest.fn().mockResolvedValue(undefined),
    };
    service = new ProductsService(
      prisma as unknown as PrismaService,
      new EventEmitter2(),
      { log: jest.fn() } as unknown as AuditService,
      storageMock as unknown as StorageService,
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    // PREMIUM plan (unlimited active products, up to 10 images) so plan-limit
    // checks in `update` never mask what we're really testing.
    const seller = await makeUser(prisma, { plan: 'PREMIUM' });
    const category = await makeCategory(prisma, { label: 'Cat' });
    sellerId = seller.id;
    categoryId = category.id;

    storageMock.deleteFiles.mockClear();
  });

  const createProductWithImages = async (urls: string[]) => {
    return prisma.product.create({
      data: {
        title: 'Test',
        price: 100,
        status: 'active',
        seller: { connect: { id: sellerId } },
        category: { connect: { id: categoryId } },
        images: {
          create: urls.map((url, i) => ({ url, sortOrder: i })),
        },
      },
    });
  };

  it('full replacement: every old URL is passed to storage.deleteFiles', async () => {
    const product = await createProductWithImages(['/uploads/a.jpg', '/uploads/b.jpg']);

    await service.update(product.id, sellerId, {
      imageUrls: ['/uploads/c.jpg', '/uploads/d.jpg'],
    } as any);

    expect(storageMock.deleteFiles).toHaveBeenCalledTimes(1);
    const dropped: string[] = storageMock.deleteFiles.mock.calls[0][0] as string[];
    expect(new Set(dropped)).toEqual(new Set(['/uploads/a.jpg', '/uploads/b.jpg']));

    const rows = await prisma.productImage.findMany({ where: { productId: product.id } });
    expect(rows.map((r) => r.url).sort()).toEqual(['/uploads/c.jpg', '/uploads/d.jpg']);
  });

  it('partial replacement: only the dropped URL is deleted (kept one stays)', async () => {
    const product = await createProductWithImages(['/uploads/a.jpg', '/uploads/b.jpg']);

    await service.update(product.id, sellerId, {
      imageUrls: ['/uploads/a.jpg', '/uploads/c.jpg'],
    } as any);

    const dropped: string[] = storageMock.deleteFiles.mock.calls[0][0] as string[];
    expect(dropped).toEqual(['/uploads/b.jpg']);
  });

  it('same URLs again: deleteFiles is not called', async () => {
    const product = await createProductWithImages(['/uploads/a.jpg', '/uploads/b.jpg']);

    await service.update(product.id, sellerId, {
      imageUrls: ['/uploads/a.jpg', '/uploads/b.jpg'],
    } as any);

    expect(storageMock.deleteFiles).not.toHaveBeenCalled();
  });

  it('reordering without adding/removing does NOT delete anything', async () => {
    const product = await createProductWithImages([
      '/uploads/a.jpg',
      '/uploads/b.jpg',
      '/uploads/c.jpg',
    ]);

    await service.update(product.id, sellerId, {
      imageUrls: ['/uploads/c.jpg', '/uploads/a.jpg', '/uploads/b.jpg'],
    } as any);

    expect(storageMock.deleteFiles).not.toHaveBeenCalled();
  });

  it('update WITHOUT imageUrls does not touch storage (leaves images alone)', async () => {
    const product = await createProductWithImages(['/uploads/a.jpg']);

    await service.update(product.id, sellerId, {
      title: 'Renamed',
    } as any);

    expect(storageMock.deleteFiles).not.toHaveBeenCalled();
    const rows = await prisma.productImage.findMany({ where: { productId: product.id } });
    expect(rows.map((r) => r.url)).toEqual(['/uploads/a.jpg']);
  });

  it('mediaItems: dropped thumbnails are cleaned up too', async () => {
    // Old: 2 media, each with a thumbnail. New: replace one, keep the other.
    // storage.deleteFiles must receive both the old URL AND its dropped thumb.
    const product = await prisma.product.create({
      data: {
        title: 'Video',
        price: 100,
        status: 'active',
        seller: { connect: { id: sellerId } },
        category: { connect: { id: categoryId } },
        images: {
          create: [
            { url: '/uploads/a.mp4', thumbnailUrl: '/uploads/a-thumb.jpg', sortOrder: 0 },
            { url: '/uploads/b.mp4', thumbnailUrl: '/uploads/b-thumb.jpg', sortOrder: 1 },
          ],
        },
      },
    });

    await service.update(product.id, sellerId, {
      mediaItems: [
        { url: '/uploads/a.mp4', type: 'video', thumbnailUrl: '/uploads/a-thumb.jpg' },
        { url: '/uploads/z.mp4', type: 'video', thumbnailUrl: '/uploads/z-thumb.jpg' },
      ],
    } as any);

    const dropped = storageMock.deleteFiles.mock.calls[0][0] as string[];
    expect(new Set(dropped)).toEqual(
      new Set(['/uploads/b.mp4', '/uploads/b-thumb.jpg']),
    );
  });

  it('rejects the update from a non-owner seller (no cleanup runs)', async () => {
    const product = await createProductWithImages(['/uploads/a.jpg']);
    const otherSeller = await makeUser(prisma);

    await expect(
      service.update(product.id, otherSeller.id, {
        imageUrls: ['/uploads/z.jpg'],
      } as any),
    ).rejects.toThrow('No tienes permiso');

    // The ForbiddenException fires BEFORE any DB or storage side-effect —
    // the original image row must still be there.
    const rows = await prisma.productImage.findMany({ where: { productId: product.id } });
    expect(rows).toHaveLength(1);
    expect(storageMock.deleteFiles).not.toHaveBeenCalled();
  });
});
