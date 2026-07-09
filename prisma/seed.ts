import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

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
    slug: 'moda',
    label: 'Moda y Vestidos',
    color: '#006b5e',
    icon: 'shirt',
    children: [
      'Ropa Mujer',
      'Ropa hombre',
      'Ropa niños',
      'Calzados',
      'Bolsos y Accesorios',
      'Joyas y relojes',
      'Otros accesorios de moda',
    ],
  },
  {
    slug: 'hogar-jardin',
    label: 'Hogar y Jardín',
    color: '#038c51',
    icon: 'house',
    children: [
      'Grandes electrodomésticos',
      'Pequeños electrodomésticos',
      'Accesorio de habitación',
      'Accesorios de baños',
      'Comodidades de la casa',
      'Platos y Utensilios',
      'Muebles y Organización',
      'Cocina',
      'Decoradores y espejos',
      'Iluminación',
      'Textiles',
      'Alfombra',
      'Puertas y Ventanas',
      'Jardín y exteriores',
      'Calefacción y climatización',
      'Bricolaje',
      'Sanitario',
      'Otros(Casa y Jardín)',
    ],
  },
  {
    slug: 'tech',
    label: 'Informatica, multimedia y dispositivos',
    color: '#0058bc',
    icon: 'cpu',
    children: [
      'Smartphone y Teléfonos',
      'Tabletas y E-book',
      'Ordenadores Portatiles',
      'Ordenadores de escritorio',
      'Gaming',
      'Dispositivos',
      'Impresoras',
      'Televisores',
      'Proyectores',
      'Foto y vídeo',
      'Audio y Hi-Fi',
      'Accesorios informáticos',
      'Otros materiales de electrónica',
    ],
  },
  {
    slug: 'articulo-bebes-niños',
    label: 'Articulos para bebés y niños',
    color: '#4278f5',
    icon: 'baby',
    children: [
      'Accesorios de Baño',
      'Alimentación',
      'Artículos de materinidad',
      'Artículos escolares',
      'Transporte de bebés y niños',
      'Tronas y andadores',
      'Mobiliario infantil',
      'Ropa infantil',
      'Seguridad y cuidado',
      'Cunas y camas',
      'Accesorios de comida',
      'Juguetes y Juegos',
      'Otros articulos de bebés y niños',
    ],
  },
  {
    slug: 'animales',
    label: 'Animales',
    color: '#8c5103',
    icon: 'dog',
    children: [
      'Animales domésticos',
      'Animales de campo',
      'Servicios de animales',
      'Alimentación de animales',
      'Otros animales',
    ],
  },
  {
    slug: 'instrumentos-musica',
    label: 'Instrumentos de Música',
    color: '#3d3287',
    icon: 'guitar',
    children: [
      'De cuerdas',
      'Teclado',
      'Viento',
      'Percusión',
      'Electrónicos',
      'Otros instrumentos musicales',
    ],
  },
  {
    slug: 'ocio-entretenimiento',
    label: 'Ocio y Entretenimineto',
    color: '#e3812b',
    icon: 'book',
    children: [
      'Arte y colecciones',
      'Películas y libros',
      'Físicas y Deportivas',
      'Artísticas y Culturales',
      'Lúdicas',
      'Viajes y billetes',
      'Otros ocio y entretenimiento',
    ],
  },
  {
    slug: 'bienestar-deporte',
    label: 'Bienestar y Deporte',
    color: '#e80505',
    icon: 'sport-shoe',
    children: [
      'Gimnasios y Fitness',
      'Actividades al Aire Libre',
      'Productos de tierra',
      'Articulos deportivos',
      'Suplementos alimenticios',
      'Alimentación en general',
      'Otros bienestar y deporte',
    ],
  },
  {
    slug: 'material-profesional',
    label: 'Materiales Profesionales',
    color: '#82157d',
    icon: 'sport-shoe',
    children: [
      'Material de Oficina',
      'Restauracion y Hostelería',
      'Material de Construcción y Reformas',
      'Balcones',
      'Electricidad e Iluminación',
      'Escaleras y andamios',
      'Ferretería',
      'Herramientas y máquinas',
      'Madera',
      'Pavimentos y revestimiento',
      'Pinturas y barnices',
      'Puertas y ventanas',
      'Material de Servicios Informáticos',
      'Material Médico',
      'Material Agrícola',
      'Material de Escuela, Guardería y Juegos',
      'Otros materiales profesionales',
    ],
  },
  {
    slug: 'stock-ventas',
    label: 'Stock y Ventas',
    color: '#c48d52',
    icon: 'circle-pile',
    children: ['Stock', 'Ventas'],
  },
  {
    slug: 'industria',
    label: 'Industria',
    color: '#c48d52',
    icon: 'forklift',
    children: ['Industria', 'Agricultura', 'Ganadería', 'Pesca'],
  },
  {
    slug: 'erotica',
    label: 'Erótica',
    color: '#c90202',
    icon: 'mars',
    children: [
      'Sexy Lencerias',
      'Juguetes',
      'Lubricantes',
      'Condones',
      'Dispositivos de vibración',
      'Dispositivos de presión y succión',
      'Dildos y artículos de inserción',
      'Accesorios de bienestar pélvico',
      'Productos para la salud sexual',
      'Artículos de uso anal',
      'Esposas y ataduras',
      'Pinzas para pezones',
      'Azotadores',
      'Columpios sexuales',
      'Otros(Erótica)',
    ],
  },
  {
    slug: 'Vehículos',
    label: 'Vehículos',
    color: '#8c5000',
    icon: 'car',
    children: [
      'Coches',
      'Motos',
      'Bicicletas',
      'Camiones',
      'Barcos',
      'Motor y accesorios',
      'Otros vehículos',
    ],
  },
  {
    slug: 'inmobiliaria',
    label: 'Inmobiliaria',
    color: '#13979e',
    icon: 'home',
    children: [
      'Apartamentos',
      'Casas',
      'Villas',
      'Piso',
      'Garaje',
      'Trastero',
      'Habitación',
      'Oficinas y escenarios',
      'Tiendas, Comercio y locales',
      'Terrenos y fincas',
      'Otras inmobiliarias',
    ],
  },
  {
    slug: 'servicios',
    label: 'Servicios',
    color: '#0058bc',
    icon: 'handshake',
    children: [
      'Limpieza',
      'Servicio de seguridad',
      'Restauracion, Bricolaje y trabajos de casa y jardín',
      'Cocina, camarero y Barman',
      'Transporte y Mudanzas',
      'Estetica y Barbero',
      'Servicios informaticos y reparación',
      'Salud',
      'Servicios de Administracion, finanzas y Jurídicos',
      'Cursos de formación',
      'Alquiler de salas de formación',
      'Eventos',
      'Negocios y gestiones comerciales',
      'Belleza',
      'Clases particulares',
      'Tecnología',
      'Otros servicios',
    ],
  },
  {
    slug: 'empleo',
    label: 'empleo',
    color: '#136b9e',
    icon: 'briefcase-business',
    children: ['Oferta de empleo', 'Busco empleo', 'Practicas'],
  },
  {
    slug: 'otro',
    label: 'Otros',
    color: '#6b003e',
    icon: 'badge-question-mark',
    children: [],
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
  avatar: string;
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
    verified: true,
    avatar: px('220453', 160),
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
    categorySlug: 'ordenadores',
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
    categorySlug: 'audio',
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
    categorySlug: 'sedan',
    title: 'Toyota Corolla 2018',
    price: 8500000,
    condition: 'Buen estado',
    city: 'Malabo',
    description: 'Único dueño, mantenimiento al día, 90.000 km.',
    image: px('164634', 600),
  },
  {
    seller: 'carlos@demo.market',
    categorySlug: 'pickup',
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
    categorySlug: 'ropa-mujer',
    title: 'Chaqueta de cuero vintage',
    price: 45000,
    condition: 'Como nuevo',
    city: 'Bata',
    description: 'Cuero genuino, talla M, color marrón.',
    image: px('1124468', 600),
  },
  {
    seller: 'carlos@demo.market',
    categorySlug: 'accesorios',
    title: 'Reloj minimalista clásico',
    price: 52000,
    condition: 'Buen estado',
    city: 'Malabo',
    description: 'Correa de piel, mecanismo de cuarzo.',
    image: px('190819', 600),
  },
  {
    seller: 'maria@demo.market',
    categorySlug: 'muebles',
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
    categorySlug: 'electrodomesticos',
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
  await prisma.rol.upsert({
    where: { label: 'USER' },
    update: {},
    create: { label: 'USER', description: 'Rol por defecto', actions: [] },
  });
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
