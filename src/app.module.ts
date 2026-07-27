import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { GqlThrottlerGuard } from './common/gql-throttler.guard';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { join } from 'path';
import { ServeStaticModule } from '@nestjs/serve-static';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BullModule } from '@nestjs/bullmq';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CategoriesModule } from './categories/categories.module';
import { RolesModule } from './roles/roles.module';
import { ProductsModule } from './products/products.module';
import { ReviewsModule } from './reviews/reviews.module';
import { NotificationsModule } from './notifications/notifications.module';
import { FollowersModule } from './followers/followers.module';
import { FavoritesModule } from './favorites/favorites.module';
import { ReportsModule } from './reports/reports.module';
import { UploadModule } from './upload/upload.module';
import { OtpModule } from './otp/otp.module';
import { HomeSectionsModule } from './home-sections/home-sections.module';
import { VerificationsModule } from './verifications/verifications.module';
import { SavedSearchesModule } from './saved-searches/saved-searches.module';
import { PaymentsModule } from './payments/payments.module';
import { AuditModule } from './audit/audit.module';
import { ExportModule } from './export/export.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot({ wildcard: true }),

    // Per-IP rate limit: generous enough for normal browsing (a screen fires
    // a handful of queries) but stops scripts inflating views/contacts stats.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),

    // BullMQ/Redis connection shared by the notifications delivery queue.
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST') || 'localhost',
          port: Number(config.get<string>('REDIS_PORT') || '6379'),
        },
      }),
    }),

    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      imports: [
        JwtModule.registerAsync({
          inject: [ConfigService],
          useFactory: (config: ConfigService) => ({
            secret: config.get<string>('JWT_SECRET'),
          }),
        }),
      ],
      inject: [JwtService],
      useFactory: (jwt: JwtService) => ({
        // In production the runtime image is read-only for `USER node` and has
        // no `src/` folder, so keep the generated schema in memory. In dev we
        // still write it out to `src/schema.gql` for tooling / diff review.
        autoSchemaFile:
          process.env.NODE_ENV === 'production'
            ? true
            : join(process.cwd(), 'src/schema.gql'),
        sortSchema: true,
        playground: true,
        // Normalize auth-related errors: any UNAUTHENTICATED error goes out
        // with a neutral message and a stable code. Clients ignore these by
        // code instead of parsing fragile message strings.
        formatError: (formattedError: any) => {
          const code = formattedError?.extensions?.code;
          if (code === 'UNAUTHENTICATED') {
            return {
              message: 'NO_SESSION',
              extensions: { code: 'UNAUTHENTICATED' },
            };
          }
          return formattedError;
        },
        subscriptions: {
          'graphql-ws': true,
        },
        context: ({ req, connection, extra }) => {
          if (req) return { req };

          if (connection) {
            const token = connection.context?.authorization;
            try {
              const payload = jwt.verify<any>(
                String(token).replace('Bearer ', ''),
              );
              return { req: { user: { id: payload.sub } } };
            } catch {
              return {};
            }
          }
          if (extra?.connectionParams?.authorization) {
            try {
              const payload = jwt.verify<any>(
                String(extra.connectionParams.authorization).replace(
                  'Bearer ',
                  '',
                ),
              );
              return { req: { user: { id: payload.sub } } };
            } catch {
              return {};
            }
          }
          return {};
        },
      }),
    }),

    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    CategoriesModule,
    RolesModule,
    ProductsModule,
    ReviewsModule,
    NotificationsModule,
    FollowersModule,
    FavoritesModule,
    ReportsModule,
    UploadModule,
    OtpModule,
    HomeSectionsModule,
    VerificationsModule,
    SavedSearchesModule,
    PaymentsModule,
    AuditModule,
    ExportModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: GqlThrottlerGuard }],
})
export class AppModule {}
