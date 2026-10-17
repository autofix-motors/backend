import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBadRequestResponse,
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
import type { SessionPrincipal } from '../../../core/auth/session-user.js';
import { AllowPendingPasswordChange } from '../../../core/decorators/allow-pending-password-change.decorator.js';
import { AnySession } from '../../../core/decorators/any-session.decorator.js';
import { CurrentPrincipal } from '../../../core/decorators/current-principal.decorator.js';
import { Public } from '../../../core/decorators/public.decorator.js';
import { LoginThrottlerGuard } from '../../../core/guards/login-throttler.guard.js';
import { PasswordThrottlerGuard } from '../../../core/guards/password-throttler.guard.js';
import { BaseResponseDto } from '../../../shared/dto/base-response.dto.js';
import { ApiBaseResponse } from '../../../shared/swagger/api-response.decorators.js';
import type { SessionOrigin } from '../sessions/sessions.service.js';
import { AuthService, type SessionResult } from './auth.service.js';
import { ChangeOwnPasswordDto } from './dto/change-own-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { CurrentSession } from './entities/current-session.entity.js';

/**
 * Inicio y cierre de sesión del personal y de los clientes. Las credenciales
 * viajan en cookies httpOnly que pone y borra este controlador; el cuerpo de la
 * respuesta nunca trae un token, así que JavaScript del navegador no tiene cómo
 * leerlo.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  /** El login del personal («Soy interno»): por DNI o correo. */
  @Public()
  @UseGuards(LoginThrottlerGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiBaseResponse(CurrentSession)
  @ApiUnauthorizedResponse({ description: 'Usuario o contraseña incorrectos' })
  @ApiTooManyRequestsResponse({ description: 'Demasiados intentos seguidos' })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<BaseResponseDto<CurrentSession>> {
    const result = await this.auth.loginStaff(
      dto.identifier,
      dto.password,
      sessionOrigin(request),
    );
    this.setCookies(response, result);
    return BaseResponseDto.success(
      new CurrentSession(result.session),
      'Sesión iniciada',
    );
  }

  /** El login del portal del cliente: por número de documento o correo. */
  @Public()
  @UseGuards(LoginThrottlerGuard)
  @Post('customer-login')
  @HttpCode(HttpStatus.OK)
  @ApiBaseResponse(CurrentSession)
  @ApiUnauthorizedResponse({
    description:
      'Usuario o contraseña incorrectos, temporal vencida o acceso suspendido',
  })
  @ApiTooManyRequestsResponse({ description: 'Demasiados intentos seguidos' })
  async customerLogin(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<BaseResponseDto<CurrentSession>> {
    const result = await this.auth.loginCustomer(
      dto.identifier,
      dto.password,
      sessionOrigin(request),
    );
    this.setCookies(response, result);
    return BaseResponseDto.success(
      new CurrentSession(result.session),
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
        new CurrentSession(result.session),
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

  @AnySession()
  @AllowPendingPasswordChange()
  @Get('session')
  @ApiBaseResponse(CurrentSession)
  @ApiUnauthorizedResponse({ description: 'Sin sesión o sesión expirada' })
  async session(
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<BaseResponseDto<CurrentSession>> {
    return BaseResponseDto.success(
      new CurrentSession(await this.auth.getSession(principal)),
      'Sesión vigente',
    );
  }

  /**
   * Cambiar la propia contraseña, del personal o de un cliente. Es lo único
   * que se puede hacer (además de ver la sesión) con la temporal sin cambiar.
   * Cierra las demás sesiones y deja cookies nuevas.
   */
  @AnySession()
  @AllowPendingPasswordChange()
  @UseGuards(PasswordThrottlerGuard)
  @Put('password')
  @ApiBaseResponse(CurrentSession)
  @ApiBadRequestResponse({
    description: 'La actual no es correcta, o la nueva no es válida',
  })
  @ApiTooManyRequestsResponse({ description: 'Demasiados intentos seguidos' })
  async changePassword(
    @Body() dto: ChangeOwnPasswordDto,
    @CurrentPrincipal() principal: SessionPrincipal,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<BaseResponseDto<CurrentSession>> {
    const result = await this.auth.changeOwnPassword(
      principal,
      dto.currentPassword,
      dto.newPassword,
      sessionOrigin(request),
    );
    this.setCookies(response, result);
    return BaseResponseDto.success(
      new CurrentSession(result.session),
      'Contraseña actualizada',
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
