require('dotenv').config({ quiet: true });
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const cs =
  process.env.DATABASE_URL ||
  'postgres://postgres:admin@localhost:5432/postgres?schema=marketplace';
const m = /[?&]schema=([^&]+)/.exec(cs);
const schema = m ? decodeURIComponent(m[1]) : 'public';
(async () => {
  const pool = new Pool({ connectionString: cs, options: `-c search_path=${schema}` });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool, { schema }) });
  const user = await prisma.user.findFirst();
  const product = await prisma.product.findFirst();
  const report = await prisma.report.create({
    data: { type: 'product', reason: 'spam', reporterId: user.id, productId: product.id },
    include: { reviewedBy: true },
  });
  console.log('create OK ->', report.id);
  await prisma.report.delete({ where: { id: report.id } });
  console.log('ALL GOOD');
  await prisma.$disconnect();
  await pool.end();
})().catch((e) => { console.error('FULL ERROR:\n' + (e.message || e)); process.exit(1); });
