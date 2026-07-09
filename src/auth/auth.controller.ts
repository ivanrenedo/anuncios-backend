import {
  Controller,
  Get,
  Query,
  Res,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private config: ConfigService,
  ) {}

  /**
   * GET /auth/google?returnUrl=exp://192.168.0.103:8081
   *
   * Redirige al usuario a Google OAuth.
   * El parámetro `returnUrl` se guarda en el `state` para redirigir
   * de vuelta a la app móvil después del login.
   */
  @Get('google')
  googleRedirect(@Query('returnUrl') returnUrl: string, @Res() res: Response) {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    const callbackUrl = this.config.get<string>('GOOGLE_CALLBACK_URL');

    if (!clientId || !callbackUrl) {
      throw new HttpException(
        'El inicio de sesión con Google no está configurado',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    // Guardar el returnUrl en el state para recuperarlo en el callback
    const state = encodeURIComponent(returnUrl || 'http://localhost:3000');

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: 'openid profile email',
      access_type: 'offline',
      state,
      prompt: 'consent',
    });

    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    res.redirect(googleAuthUrl);
  }

  /**
   * GET /auth/google/callback?code=...&state=...
   *
   * Google redirige aquí después del login.
   * Intercambia el code por tokens, crea/busca el usuario,
   * genera JWT y redirige a la app móvil con el token.
   */
  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    const returnUrl = state ? decodeURIComponent(state) : null;

    // Si Google devuelve error
    if (error) {
      console.error('[Auth] Google OAuth error:', error);
      if (returnUrl) {
        return res.redirect(`${returnUrl}?error=${encodeURIComponent(error)}`);
      }
      throw new HttpException(
        `Error de inicio de sesión con Google: ${error}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!code) {
      throw new HttpException(
        'No se recibió el código de autorización',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
      const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET');
      const callbackUrl = this.config.get<string>('GOOGLE_CALLBACK_URL');

      // 1. Intercambiar el code por tokens
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: callbackUrl,
          grant_type: 'authorization_code',
        }).toString(),
      });

      const tokenData = await tokenRes.json();

      if (!tokenData.access_token) {
        console.error('[Auth] Token exchange failed:', tokenData);
        throw new Error('Failed to exchange code for tokens');
      }

      // 2. Obtener info del usuario de Google
      const userInfoRes = await fetch(
        'https://www.googleapis.com/oauth2/v3/userinfo',
        { headers: { Authorization: `Bearer ${tokenData.access_token}` } },
      );
      const userInfo = await userInfoRes.json();

      // 3. Crear o buscar usuario en la base de datos y generar JWT
      const result = await this.authService.googleLogin(
        userInfo.sub,
        userInfo.email,
        userInfo.name,
        userInfo.picture,
      );

      console.log(`[Auth] Login exitoso: ${userInfo.email}`);

      // 4. Redirigir a la app móvil con el token
      if (returnUrl) {
        const separator = returnUrl.includes('?') ? '&' : '?';
        const redirectTarget =
          `${returnUrl}${separator}` +
          `token=${encodeURIComponent(result.accessToken)}` +
          `&userId=${encodeURIComponent(result.user.id)}` +
          `&name=${encodeURIComponent(result.user.name)}` +
          `&email=${encodeURIComponent(result.user.email)}` +
          `&avatar=${encodeURIComponent(result.user.avatarUrl || '')}`;

        // Usar HTML con JavaScript redirect para mejor soporte de deep links
        return res.send(`
          <!DOCTYPE html>
          <html>
          <head><title>Redirecting...</title></head>
          <body>
            <p>Autenticación exitosa. Redirigiendo a la app...</p>
            <script>
              window.location.href = ${JSON.stringify(redirectTarget)};
            </script>
            <noscript>
              <a href="${redirectTarget}">Click aquí para volver a la app</a>
            </noscript>
          </body>
          </html>
        `);
      }

      // Fallback: devolver JSON si no hay returnUrl
      return res.json({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user: result.user,
      });
    } catch (err) {
      console.error('[Auth] Callback error:', err);

      if (returnUrl) {
        return res.redirect(
          `${returnUrl}?error=${encodeURIComponent('Authentication failed')}`,
        );
      }

      throw new HttpException(
        'Authentication failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
