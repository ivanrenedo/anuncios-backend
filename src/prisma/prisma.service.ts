import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const connectionString =
  process.env.DATABASE_URL ||
  'postgres://postgres:admin@localhost:5432/postgres?schema=marketplace';

// The `pg` driver ignores the `?schema=` URL param, so the connection would
// default to the `public` search_path and fail to find the tables that Prisma
// created in this schema. Pull the schema out of the URL and apply it as the
// session search_path so the adapter resolves unqualified table names.
const schemaMatch = /[?&]schema=([^&]+)/.exec(connectionString);
const dbSchema = schemaMatch ? decodeURIComponent(schemaMatch[1]) : 'public';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString,
      options: `-c search_path=${dbSchema}`,
    });
    // The adapter must also be told the schema, otherwise Prisma qualifies
    // table names with `public` and ignores the session search_path.
    const adapter = new PrismaPg(pool, { schema: dbSchema });
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
