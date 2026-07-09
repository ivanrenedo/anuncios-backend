import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { OtpService } from './otp.service';
import { SmsService } from './sms.service';
import { OtpEmailService } from './email.service';
import { OtpResolver } from './otp.resolver';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  providers: [OtpService, SmsService, OtpEmailService, OtpResolver],
  exports: [OtpService],
})
export class OtpModule {}
