import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { verifyPin } from '../common/pin.util';
import { DEFAULT_ROLE_LABEL } from '../common/defaults';
import { PLAN_LIMITS, activePlan } from '../common/plan-limits';

interface GooglePayload {
  googleId: string;
  email: string;
  name: string;
  avatar?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async validateOrCreateUser(payload: GooglePayload) {
    const byGoogleId = await this.prisma.user.findUnique({
      where: { googleId: payload.googleId },
    });
    if (byGoogleId) return byGoogleId;

    // A user may already exist with this email but no googleId (created via
    // admin PIN, seeded, or a previous flow). Link the Google identity to
    // that row instead of failing with P2002 on the email unique constraint.
    const byEmail = await this.prisma.user.findUnique({
      where: { email: payload.email },
    });
    if (byEmail) {
      return this.prisma.user.update({
        where: { id: byEmail.id },
        data: {
          googleId: payload.googleId,
          avatarUrl: byEmail.avatarUrl ?? payload.avatar,
        },
      });
    }

    // Ensure the default "USER" role exists and assign it to the new user.
    const role = await this.prisma.rol.upsert({
      where: { label: DEFAULT_ROLE_LABEL },
      update: {},
      create: {
        label: DEFAULT_ROLE_LABEL,
        description: 'Rol por defecto',
        actions: [],
      },
    });
    return this.prisma.user.create({
      data: {
        googleId: payload.googleId,
        email: payload.email,
        name: payload.name,
        avatarUrl: payload.avatar,
        rol: { connect: { id: role.id } },
      },
    });
  }

  generateTokens(userId: string) {
    const accessToken = this.jwt.sign({ sub: userId }, { expiresIn: '7d' });
    const refreshToken = this.jwt.sign({ sub: userId }, { expiresIn: '30d' });
    return { accessToken, refreshToken };
  }

  async refreshToken(token: string) {
    const decoded = this.jwt.verify(token);
    const user = await this.prisma.user.findUnique({
      where: { id: decoded.sub },
    });
    if (!user) throw new Error('User not found');
    if (user.permission === 'DENIED') {
      throw new ForbiddenException('Tu cuenta ha sido suspendida.');
    }
    return this.generateTokens(user.id);
  }

  async googleLogin(
    googleId: string,
    email: string,
    name: string,
    avatar?: string,
  ) {
    const user = await this.validateOrCreateUser({
      googleId,
      email,
      name,
      avatar,
    });
    if (user.permission === 'DENIED') {
      throw new ForbiddenException(
        'Tu cuenta ha sido suspendida. Contacta con soporte.',
      );
    }
    const tokens = this.generateTokens(user.id);
    return { user, ...tokens };
  }

  /**
   * Admin panel login: validates email + PIN against the user table and
   * requires the account to have panel access (`permission = GRANTED`).
   */
  async adminLogin(email: string, pin: string) {
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: email.trim(), mode: 'insensitive' } },
    });
    if (!user || !verifyPin(pin, (user as any).pin)) {
      throw new UnauthorizedException('Email o PIN incorrecto');
    }
    if ((user as any).permission !== 'GRANTED') {
      throw new ForbiddenException('Tu cuenta no tiene acceso al panel');
    }
    const tokens = this.generateTokens(user.id);
    return { user, ...tokens };
  }

  async logout(userId: string) {
    await this.prisma.pushToken.deleteMany({ where: { userId } });
    return true;
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return null;
    const effective = activePlan(user);
    const limits = PLAN_LIMITS[effective];
    return {
      ...user,
      effectivePlan: effective,
      maxActiveProducts: Number.isFinite(limits.maxActiveProducts)
        ? limits.maxActiveProducts
        : null,
      maxImagesPerProduct: limits.maxImagesPerProduct,
    };
  }
}
