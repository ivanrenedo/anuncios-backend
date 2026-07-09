import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot({ wildcard: true }),

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
      inject: [ConfigService, JwtService],
      useFactory: (config: ConfigService, jwt: JwtService) => ({
        autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
        sortSchema: true,
        playground: true,
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
  ],
})
export class AppModule {}
