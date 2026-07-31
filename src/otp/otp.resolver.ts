import { Resolver, Mutation, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OtpService } from './otp.service';
import { SmsService } from './sms.service';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { GetCurrentUserId } from '../auth/decorators/current-user.decorator';
import { OtpResponse } from './dto/otp-response';
import { SendPhoneOtpInput } from './dto/send-phone-otp.input';
import { VerifyPhoneOtpInput } from './dto/verify-phone-otp.input';
import { VerifyPinChangeOtpInput } from './dto/verify-pin-change-otp.input';
import { ChangePinInput } from './dto/change-pin.input';
import { isValidPhone, normalizePhone } from '../common/phone.util';
import { hashPin } from '../common/pin.util';
import { BadRequestException } from '@nestjs/common';

@Resolver()
export class OtpResolver {
  constructor(
    private otpService: OtpService,
    private smsService: SmsService,
    private emailService: EmailService,
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  // ── Phone Verification (mobile + shop) ──

  @Mutation(() => OtpResponse)
  @UseGuards(GqlAuthGuard)
  async sendPhoneOtp(
    @GetCurrentUserId() userId: string,
    @Args('input') input: SendPhoneOtpInput,
  ): Promise<OtpResponse> {
    const phone = normalizePhone(input.phone);
    if (!isValidPhone(phone)) {
      throw new BadRequestException('Formato de teléfono inválido');
    }

    const code = await this.otpService.generate(
      userId,
      'sms',
      phone,
      'phone_verify',
    );
    await this.smsService.sendOtp(phone, code);

    return { success: true, message: 'Código enviado' };
  }

  @Mutation(() => OtpResponse)
  @UseGuards(GqlAuthGuard)
  async verifyPhoneOtp(
    @GetCurrentUserId() userId: string,
    @Args('input') input: VerifyPhoneOtpInput,
  ): Promise<OtpResponse> {
    const otp = await this.otpService.verify(
      userId,
      'phone_verify',
      input.code,
    );

    await this.prisma.user.update({
      where: { id: userId },
      data: { phone: otp.target, verified: false },
    });

    return { success: true, message: 'Teléfono verificado correctamente' };
  }

  // ── Admin PIN Change ──

  @Mutation(() => OtpResponse)
  @UseGuards(AdminGuard)
  async requestPinChangeOtp(
    @GetCurrentUserId() userId: string,
  ): Promise<OtpResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user) throw new BadRequestException('Usuario no encontrado');

    const code = await this.otpService.generate(
      userId,
      'email',
      user.email,
      'pin_change',
    );
    await this.emailService.send({
      toEmail: user.email,
      userId,
      payload: {
        template: 'pin_code',
        data: { code, expiresInMinutes: 5 },
      },
      // Fresh code every request; the OTP row's id would be ideal but we don't
      // have it here — codes themselves are single-use so template+code is enough.
      dedupeKey: `pin_code:${userId}:${code}`,
    });

    return { success: true, message: 'Código enviado a tu email' };
  }

  @Mutation(() => OtpResponse)
  @UseGuards(AdminGuard)
  async verifyPinChangeOtp(
    @GetCurrentUserId() userId: string,
    @Args('input') input: VerifyPinChangeOtpInput,
  ): Promise<OtpResponse> {
    await this.otpService.verify(userId, 'pin_change', input.code);

    const pinChangeToken = this.jwt.sign(
      { sub: userId, purpose: 'pin_change' },
      { expiresIn: '5m' },
    );

    return {
      success: true,
      message: 'Código verificado',
      pinChangeToken,
    };
  }

  @Mutation(() => OtpResponse)
  @UseGuards(AdminGuard)
  async changePinWithOtp(
    @GetCurrentUserId() userId: string,
    @Args('input') input: ChangePinInput,
  ): Promise<OtpResponse> {
    let payload: any;
    try {
      payload = this.jwt.verify(input.pinChangeToken);
    } catch {
      throw new BadRequestException(
        'Token de cambio de PIN inválido o expirado',
      );
    }

    if (payload.sub !== userId || payload.purpose !== 'pin_change') {
      throw new BadRequestException(
        'Token de cambio de PIN inválido o expirado',
      );
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { pin: hashPin(input.newPin) },
    });

    return { success: true, message: 'PIN actualizado correctamente' };
  }
}
