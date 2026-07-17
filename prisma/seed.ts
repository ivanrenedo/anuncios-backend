import 'dotenv/config';
import { Action, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { DEFAULT_PIN, hashPin } from '../src/common/pin.util';

// Mirror PrismaService: the `pg` driver ignores `?schema=`, so apply the schema
// as the session search_path and tell the adapter about it explicitly.
const connectionString =
  process.env.DATABASE_URL ||
  'postgres://postgres:admin@localhost:5432/postgres?schema=marketplace';
const schemaMatch = /[?&]schema=([^&]+)/.exec(connectionString);
const dbSchema = schemaMatch ? decodeURIComponent(schemaMatch[1]) : 'public';

const pool = new Pool({
  connectionString,
  options: `-c search_path=${dbSchema}`,
});
const adapter = new PrismaPg(pool, { schema: dbSchema });
const prisma = new PrismaClient({ adapter });

const ACCENTS: Record<string, string> = {
  á: 'a',
  à: 'a',
  ä: 'a',
  â: 'a',
  ã: 'a',
  é: 'e',
  è: 'e',
  ë: 'e',
  ê: 'e',
  í: 'i',
  ì: 'i',
  ï: 'i',
  î: 'i',
  ó: 'o',
  ò: 'o',
  ö: 'o',
  ô: 'o',
  õ: 'o',
  ú: 'u',
  ù: 'u',
  ü: 'u',
  û: 'u',
  ñ: 'n',
  ç: 'c',
};

const slugify = (s: string) =>
  s
    .toLowerCase()
    .split('')
    .map((ch) => ACCENTS[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

// ── Catalog (menu tree) ───────────────────────────────────────────────────────
const CATALOG: {
  slug: string;
  label: string;
  color: string;
  icon: string;
  children: string[];
}[] = [
  {
    slug: 'moda_complementos',
    label: 'Moda y Complementos',
    color: '#1877F2',
    icon: 'shirt',
    children: [
      'Mujer',
      'Hombre',
      'Niños',
      'Calzado',
      'Bolsos y Mochilas',
      'Joyería',
      'Relojes',
      'Gafas',
      'Cinturones y Accesorios',
      'Ropa de Boda',
      'Ropa Deportiva',
      'Ropa Premamá',
      'Disfraces',
      'Vintage',
    ],
  },
  {
    slug: 'electronica_foto',
    label: 'Electrónica y Foto',
    color: '#2337ba',
    icon: 'smartphone',
    children: [
      'Móviles',
      'Accesorios Móvil',
      'TV',
      'Proyectores',
      'Audio y Altavoces',
      'Auriculares',
      'Cámaras',
      'Objetivos y Accesorios Foto',
      'Drones',
      'Wearables y Smartwatches',
      'Cables y Cargadores',
      'Baterías Externas',
    ],
  },
  {
    slug: 'informatica_gaming',
    label: 'Informática y Gaming',
    color: '#1538e8',
    icon: 'laptop',
    children: [
      'Portátiles',
      'PC Sobremesa',
      'Tablets',
      'Monitores',
      'Teclados y Ratones',
      'Componentes',
      'Almacenamiento Externo',
      'Redes y Wifi',
      'Impresoras y Escáneres',
      'Software',
      'Consolas',
      'Videojuegos',
      'Mandos y Accesorios Gaming',
    ],
  },
  {
    slug: 'hogar_jardin_bricolaje',
    label: 'Hogar, Jardín y Bricolaje',
    color: '#53ec60',
    icon: 'house',
    children: [
      'Muebles Salón',
      'Muebles Dormitorio',
      'Muebles Cocina',
      'Muebles Baño',
      'Decoración',
      'Iluminación',
      'Textil Hogar',
      'Cocina y Menaje',
      'Jardín y Exterior',
      'Barbacoas',
      'Plantas y Semillas',
      'Herramientas Manuales',
      'Herramientas Eléctricas',
      'Materiales de Construcción',
      'Fontanería',
      'Ferretería',
      'Mascotas',
    ],
  },
  {
    slug: 'electrodomesticos',
    label: 'Electrodomésticos',
    color: '#6e84f5',
    icon: 'refrigerator',
    children: [
      'Grandes Electrodomésticos',
      'Pequeños Electrodomésticos',
      'Aire Acondicionado',
      'Calefacción',
      'Aspiradoras y Limpieza',
      'Cocina Eléctrica',
    ],
  },
  {
    slug: 'vehiculos',
    label: 'Vehículos',
    color: '#8c5000',
    icon: 'car',
    children: [
      'Coches',
      'Motos',
      'Bicicletas',
      'Bicis Eléctricas y Patinetes',
      'Caravanas y Autocaravanas',
      'Náutica',
      'Camiones y Furgonetas',
      'Recambios Coche',
      'Recambios Moto',
      'Neumáticos y Llantas',
      'Audio y Navegación',
      'Accesorios y Tuning',
      'Herramientas de Taller',
    ],
  },
  {
    slug: 'inmobiliaria',
    label: 'Inmobiliaria',
    color: '#13979e',
    icon: 'building2',
    children: [
      'Pisos',
      'Casas y Chalets',
      'Habitaciones',
      'Garajes y Trasteros',
      'Locales y Oficinas',
      'Naves Industriales',
      'Terrenos y Fincas',
      'Alquiler Vacacional',
    ],
  },
  {
    slug: 'deporte_aire_libre',
    label: 'Deporte y Aire Libre',
    color: '#2625a0',
    icon: 'dumbbell',
    children: [
      'Fitness y Gimnasio',
      'Ciclismo',
      'Running',
      'Camping y Senderismo',
      'Deportes de Equipo',
      'Náutica y Agua',
      'Nieve e Invierno',
      'Caza y Pesca',
      'Golf',
      'Tenis y Pádel',
      'Boxeo y Artes Marciales',
    ],
  },
  {
    slug: 'ninos_bebes',
    label: 'Niños y Bebés',
    color: '#e81558',
    icon: 'baby',
    children: [
      'Ropa Bebé y Niño',
      'Calzado Infantil',
      'Juguetes Bebé',
      'Juguetes Niño',
      'Cochecitos y Sillas de Coche',
      'Tronas y Cunas',
      'Alimentación Bebé',
      'Habitación Infantil',
      'Educativo y Libros Infantiles',
    ],
  },
  {
    slug: 'belleza_salud',
    label: 'Belleza y Salud',
    color: '#44aa20',
    icon: 'sparkles',
    children: [
      'Maquillaje',
      'Cuidado Facial',
      'Cuidado Corporal',
      'Cabello',
      'Perfumes',
      'Uñas',
      'Higiene Personal',
      'Afeitado y Depilación',
      'Suplementos y Nutrición',
      'Ortopedia y Movilidad',
      'Erótica y Bienestar Sexual',
    ],
  },
  {
    slug: 'ocio_libros_coleccionismo',
    label: 'Ocio, Libros y Coleccionismo',
    color: '#a037a0',
    icon: 'bookOpen',
    children: [
      'Libros',
      'Cómics y Manga',
      'Revistas',
      'Música CDs y Vinilos',
      'Películas y Series',
      'Instrumentos Musicales',
      'Juegos de Mesa y Puzzles',
      'Modelismo y Maquetas',
      'Coleccionismo',
      'Antigüedades y Arte',
      'Juguetes de Colección',
      'Manualidades y Hobbies',
    ],
  },
  {
    slug: 'servicios',
    label: 'Servicios',
    color: '#0058bc',
    icon: 'wrench',
    children: [
      'Reparaciones y Bricolaje',
      'Limpieza',
      'Mudanzas y Transporte',
      'Informática y Soporte Técnico',
      'Belleza y Peluquería',
      'Clases Particulares',
      'Eventos y Catering',
      'Diseño y Creatividad',
      'Salud y Bienestar',
      'Legal y Administración',
      'Otros Servicios',
    ],
  },
  {
    slug: 'empleo',
    label: 'Empleo',
    color: '#136b9e',
    icon: 'briefcase-business',
    children: [
      'Oferta de Empleo',
      'Busco Empleo',
      'Prácticas',
      'Freelance',
      'Trabajo Temporal',
    ],
  },
];

// ── Demo sellers ──────────────────────────────────────────────────────────────
const px = (id: string, w: number) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${w}`;

const SELLERS: {
  email: string;
  name: string;
  location: string;
  verified: boolean;
  avatar?: string;
}[] = [
  {
    email: 'maria@demo.market',
    name: 'María N.',
    location: 'Malabo',
    verified: true,
    avatar: px('415829', 160),
  },
  {
    email: 'carlos@demo.market',
    name: 'Carlos E.',
    location: 'Bata',
    verified: false,
    avatar: px('614810', 160),
  },
  {
    email: 'antonio@demo.market',
    name: 'Antonio M.',
    location: 'Ebibeyin',
    verified: false,
    avatar: px('220453', 160),
  },
  {
    email: 'digitalcorps365@gmail.com',
    name: 'Benjamin Buika Renedo',
    location: 'Malabo',
    verified: true,
  },
];

// ── Demo products (categorySlug references a seeded child category) ────────────
const PRODUCTS: {
  seller: string;
  categorySlug: string;
  title: string;
  price: number;
  discount?: number;
  condition: string;
  city: string;
  description: string;
  image: string;
}[] = [
  {
    seller: 'carlos@demo.market',
    categorySlug: 'moviles',
    title: 'iPhone 15 Pro Max 256GB',
    price: 980000,
    condition: 'Nuevo',
    city: 'Malabo',
    description: 'Sellado, garantía. Color titanio natural.',
    image: px('788946', 600),
  },
  {
    seller: 'maria@demo.market',
    categorySlug: 'portatiles',
    title: 'MacBook Air M2 13"',
    price: 850000,
    discount: 10,
    condition: 'Como nuevo',
    city: 'Bata',
    description: 'Apenas usado, 8GB/256GB, con cargador y caja.',
    image: px('812264', 600),
  },
  {
    seller: 'antonio@demo.market',
    categorySlug: 'auriculares',
    title: 'Sony WH-1000XM5',
    price: 180000,
    condition: 'Nuevo',
    city: 'Malabo',
    description: 'Cancelación de ruido líder. Precintados.',
    image: px('3394650', 600),
  },
  {
    seller: 'maria@demo.market',
    categorySlug: 'camaras',
    title: 'Cámara Sony Alpha 7 IV',
    price: 540000,
    condition: 'Como nuevo',
    city: 'Ebibeyin',
    description: 'Cuerpo + objetivo 28-70mm. 6.000 disparos.',
    image: px('243757', 600),
  },
  {
    seller: 'antonio@demo.market',
    categorySlug: 'coches',
    title: 'Toyota Corolla 2018',
    price: 8500000,
    condition: 'Buen estado',
    city: 'Malabo',
    description: 'Único dueño, mantenimiento al día, 90.000 km.',
    image: px('164634', 600),
  },
  {
    seller: 'carlos@demo.market',
    categorySlug: 'coches',
    title: 'Toyota Hilux 4x4',
    price: 15200000,
    condition: 'Como nuevo',
    city: 'Bata',
    description: 'Doble cabina, diésel, ideal para todoterreno.',
    image: px('1149831', 600),
  },
  {
    seller: 'antonio@demo.market',
    categorySlug: 'motos',
    title: 'Yamaha MT-07 2022',
    price: 4200000,
    condition: 'Nuevo',
    city: 'Ebibeyin',
    description: 'Naked 689cc, pocos kilómetros, documentación lista.',
    image: px('2393821', 600),
  },
  {
    seller: 'maria@demo.market',
    categorySlug: 'calzado',
    title: 'Nike Air Zoom Pegasus 39',
    price: 85000,
    condition: 'Nuevo',
    city: 'Malabo',
    description: 'Talla 43, sin estrenar, en caja original.',
    image: px('2529148', 600),
  },
  {
    seller: 'maria@demo.market',
    categorySlug: 'mujer',
    title: 'Chaqueta de cuero vintage',
    price: 45000,
    condition: 'Como nuevo',
    city: 'Bata',
    description: 'Cuero genuino, talla M, color marrón.',
    image: px('1124468', 600),
  },
  {
    seller: 'carlos@demo.market',
    categorySlug: 'relojes',
    title: 'Reloj minimalista clásico',
    price: 52000,
    condition: 'Buen estado',
    city: 'Malabo',
    description: 'Correa de piel, mecanismo de cuarzo.',
    image: px('190819', 600),
  },
  {
    seller: 'maria@demo.market',
    categorySlug: 'muebles-salon',
    title: 'Sofá de 3 plazas moderno',
    price: 420000,
    discount: 15,
    condition: 'Como nuevo',
    city: 'Malabo',
    description: 'Tapizado gris, muy cómodo, poco uso.',
    image: px('1571460', 600),
  },
  {
    seller: 'antonio@demo.market',
    categorySlug: 'grandes-electrodomesticos',
    title: 'Refrigerador LG 400L',
    price: 380000,
    condition: 'Nuevo',
    city: 'Malabo',
    description: 'No frost, eficiencia A++, garantía 2 años.',
    image: px('2724748', 600),
  },
];

async function seedCategories(): Promise<Map<string, string>> {
  const idBySlug = new Map<string, string>();
  for (let i = 0; i < CATALOG.length; i++) {
    const c = CATALOG[i];
    const parent = await prisma.category.upsert({
      where: { slug: c.slug },
      update: {
        label: c.label,
        color: c.color,
        icon: c.icon,
        sortOrder: i,
        parentId: null,
      },
      create: {
        slug: c.slug,
        label: c.label,
        color: c.color,
        icon: c.icon,
        sortOrder: i,
      },
    });
    idBySlug.set(c.slug, parent.id);

    for (let j = 0; j < c.children.length; j++) {
      const name = c.children[j];
      const slug = slugify(name);

      const child = await prisma.category.upsert({
        where: { slug },
        update: { label: name, parentId: parent.id, sortOrder: j },
        create: { slug, label: name, parentId: parent.id, sortOrder: j },
      });
      idBySlug.set(slug, child.id);
    }
  }
  return idBySlug;
}

async function seedSellers(): Promise<Map<string, string>> {
  const idByEmail = new Map<string, string>();
  for (const s of SELLERS) {
    const user = await prisma.user.upsert({
      where: { email: s.email },
      update: {
        name: s.name,
        location: s.location,
        verified: s.verified,
        avatarUrl: s.avatar,
        rol: { connect: { label: 'USER' } },
      },
      create: {
        name: s.name,
        email: s.email,
        location: s.location,
        verified: s.verified,
        avatarUrl: s.avatar,
      },
    });
    idByEmail.set(s.email, user.id);
  }

  return idByEmail;
}

async function seedProducts(
  catBySlug: Map<string, string>,
  sellerByEmail: Map<string, string>,
) {
  const sellerIds = [...sellerByEmail.values()];
  // Idempotent: wipe demo sellers' products (cascades to images/attributes).
  await prisma.product.deleteMany({ where: { sellerId: { in: sellerIds } } });

  for (const p of PRODUCTS) {
    const categoryId = catBySlug.get(p.categorySlug);
    const sellerId = sellerByEmail.get(p.seller);
    if (!categoryId || !sellerId) continue;
    await prisma.product.create({
      data: {
        sellerId,
        categoryId,
        title: p.title,
        description: p.description,
        price: p.price,
        discount: p.discount && p.discount > 0 ? p.discount : null,
        condition: p.condition,
        city: p.city,
        status: 'active',
        images: { create: [{ url: p.image, sortOrder: 0 }] },
      },
    });
  }
}

async function seedRoles() {
  // Default role new users are assigned to.
  const roles: {
    label: string;
    description: string;
    actions: Action[];
  }[] = [
    {
      label: 'USER',
      description: 'Rol por defecto',
      actions: [],
    },
    {
      label: 'SUPER_ADMIN',
      description: 'Rol super admin',
      actions: ['create', 'read', 'update', 'delete'],
    },
  ];

  const upsertPromises = roles.map((item) =>
    prisma.rol.upsert({
      where: { label: item.label },
      update: { ...item },
      create: { ...item },
    }),
  );

  await prisma.$transaction(upsertPromises);
}

async function main() {
  await seedRoles();
  const catBySlug = await seedCategories();
  const sellerByEmail = await seedSellers();
  await seedProducts(catBySlug, sellerByEmail);

  const [categories, users, products, roles] = await Promise.all([
    prisma.category.count(),
    prisma.user.count(),
    prisma.product.count(),
    prisma.rol.count(),
  ]);

  await prisma.user.update({
    where: { email: 'digitalcorps365@gmail.com' },
    data: {
      rol: { connect: { label: 'SUPER_ADMIN' } },
      pin: hashPin(DEFAULT_PIN),
    },
  });
  console.log(
    `Seed done. categories:${categories} users:${users} products:${products} roles:${roles}`,
  );
}

main()
  .then(() => {
    // Exit explicitly: the pg driver adapter can crash on teardown on Windows,
    // and all work is already committed by this point.
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
