import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { OtpService } from './otp.service';
import { SmsService } from './sms.service';
import { OtpResolver } from './otp.resolver';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    EmailModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  providers: [OtpService, SmsService, OtpResolver],
  exports: [OtpService],
})
export class OtpModule {}
