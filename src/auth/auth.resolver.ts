import { Resolver, Mutation, Query, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { GqlAuthGuard } from './guards/gql-auth.guard';
import { GetCurrentUserId } from './decorators/current-user.decorator';
import { AuthResponse } from './dto/auth-response';
import { GoogleLoginInput } from './dto/google-login.input';
import { AdminLoginInput } from './dto/admin-login.input';
import { UserModel } from '../users/dto/user.model';

@Resolver()
export class AuthResolver {
  constructor(private authService: AuthService) {}

  @Mutation(() => AuthResponse)
  async googleLogin(@Args('input') input: GoogleLoginInput) {
    return this.authService.googleLogin(
      input.googleId,
      input.email,
      input.name,
      input.avatar,
    );
  }

  @Mutation(() => AuthResponse)
  async adminLogin(@Args('input') input: AdminLoginInput) {
    return this.authService.adminLogin(input.email, input.pin);
  }

  @Mutation(() => AuthResponse)
  async refreshToken(@Args('token') token: string) {
    const tokens = await this.authService.refreshToken(token);
    return { ...tokens, user: null };
  }

  @Query(() => UserModel, { nullable: true })
  @UseGuards(GqlAuthGuard)
  async me(@GetCurrentUserId() userId: string) {
    return this.authService.getMe(userId);
  }
}
