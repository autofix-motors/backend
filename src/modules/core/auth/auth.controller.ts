import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  accessCookieOptions,
  refreshCookieOptions,
} from '../../../core/auth/cookies.js';
import type { SessionUser } from '../../../core/auth/session-user.js';
import { CurrentUser } from '../../../core/decorators/current-user.decorator.js';
import { Public } from '../../../core/decorators/public.decorator.js';
import { LoginThrottlerGuard } from '../../../core/guards/login-throttler.guard.js';
import { BaseResponseDto } from '../../../shared/dto/base-response.dto.js';
import { ApiBaseResponse } from '../../../shared/swagger/api-response.decorators.js';
import { AuthService, type SessionResult } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { CurrentSession } from './entities/current-session.entity.js';
import type { SessionOrigin } from './sessions.service.js';

/**
 * Inicio y cierre de sesión. Las credenciales viajan en cookies httpOnly que
 * pone y borra este controlador; el cuerpo de la respuesta nunca trae un token,
 * así que JavaScript del navegador no tiene cómo leerlo.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @UseGuards(LoginThrottlerGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiBaseResponse(CurrentSession)
  @ApiUnauthorizedResponse({ description: 'Correo o contraseña incorrectos' })
  @ApiTooManyRequestsResponse({ description: 'Demasiados intentos seguidos' })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<BaseResponseDto<CurrentSession>> {
    const result = await this.auth.login(
      dto.email,
      dto.password,
      sessionOrigin(request),
    );
    this.setCookies(response, result);
    return BaseResponseDto.success(
      new CurrentSession(result.user),
      'Sesión iniciada',
    );
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiBaseResponse(CurrentSession)
  @ApiUnauthorizedResponse({ description: 'La sesión expiró o fue revocada' })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<BaseResponseDto<CurrentSession>> {
    const token = readRefreshToken(request);
    if (!token) {
      throw new UnauthorizedException(
        'Tu sesión expiró. Vuelve a iniciar sesión',
      );
    }
    try {
      const result = await this.auth.refresh(token, sessionOrigin(request));
      this.setCookies(response, result);
      return BaseResponseDto.success(
        new CurrentSession(result.user),
        'Sesión renovada',
      );
    } catch (error) {
      // Un refresh que no sirve deja las cookies viejas inservibles: se borran
      // para que el cliente no siga mandándolas.
      this.clearCookies(response);
      throw error;
    }
  }

  // Público porque debe funcionar aunque el acceso ya haya vencido: cerrar
  // sesión con un JWT expirado tiene que revocar igual el refresh.
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBaseResponse(null, { description: 'Sesión cerrada' })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<BaseResponseDto<null>> {
    const token = readRefreshToken(request);
    if (token) await this.auth.logout(token);
    this.clearCookies(response);
    return BaseResponseDto.success(null, 'Sesión cerrada');
  }

  @Get('session')
  @ApiBaseResponse(CurrentSession)
  @ApiUnauthorizedResponse({ description: 'Sin sesión o sesión expirada' })
  async session(
    @CurrentUser() user: SessionUser,
  ): Promise<BaseResponseDto<CurrentSession>> {
    return BaseResponseDto.success(
      new CurrentSession(await this.auth.getSession(user.userId)),
      'Sesión vigente',
    );
  }

  private setCookies(response: Response, result: SessionResult) {
    const isProduction = this.isProduction();
    response.cookie(
      ACCESS_COOKIE,
      result.accessToken,
      accessCookieOptions(
        isProduction,
        this.config.getOrThrow<number>('ACCESS_TOKEN_MINUTES'),
      ),
    );
    response.cookie(
      REFRESH_COOKIE,
      result.refreshToken,
      refreshCookieOptions(
        isProduction,
        this.config.getOrThrow<number>('REFRESH_TOKEN_DAYS'),
      ),
    );
  }

  private clearCookies(response: Response) {
    // clearCookie necesita la misma ruta con la que se puso la cookie, o el
    // navegador la conserva. Por eso se reusan las mismas opciones sin maxAge.
    const isProduction = this.isProduction();
    const { maxAge: _a, ...access } = accessCookieOptions(isProduction, 0);
    const { maxAge: _r, ...refresh } = refreshCookieOptions(isProduction, 0);
    response.clearCookie(ACCESS_COOKIE, access);
    response.clearCookie(REFRESH_COOKIE, refresh);
  }

  private isProduction(): boolean {
    return this.config.get<string>('NODE_ENV') === 'production';
  }
}

function readRefreshToken(request: Request): string | undefined {
  const token: unknown = request.cookies?.[REFRESH_COOKIE];
  return typeof token === 'string' && token ? token : undefined;
}

function sessionOrigin(request: Request): SessionOrigin {
  return {
    ip: request.ip,
    userAgent: request.get('user-agent')?.slice(0, 500),
  };
}
