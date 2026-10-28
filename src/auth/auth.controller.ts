import { Body, Controller, Get, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, SwitchClinicDto } from './auth.dto';
import { CurrentUser, CurrentUserData } from '../common/decorators/current-user.decorator';
import { Throttle } from '@nestjs/throttler';
import { detailResponse } from '../common/api-response';
import { toPaginatedResult } from '../common/pagination';
import { Roles } from './roles.decorator';
import { Role } from '../generated/prisma/client';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  /** 5 intentos por minuto: frena el fuerza bruta contra credenciales. */
  @Throttle({ short: { limit: 5, ttl: 60_000 } })
  @Post('login')
  async login(@Body() credentials: LoginDto) {
    return await this.authService.login(credentials);
  }

  @Throttle({ short: { limit: 5, ttl: 60_000 } })
  @Roles(Role.DOCTOR)
  @Post('register')
  async register(@Body() register: RegisterDto, @CurrentUser() user: CurrentUserData) {
    return await this.authService.register(register, user.userId, user.clinicId);
  }

  /** Consultorios a los que pertenece el usuario, para el selector del frontend. */
  @Get('clinics')
  async getClinics(@CurrentUser() user: CurrentUserData) {
    const clinics = await this.authService.getClinics(user.userId);
    return toPaginatedResult(clinics, clinics.length, 1, Math.max(clinics.length, 1));
  }

  /**
   * Cambia el consultorio activo y devuelve un token nuevo. Un mismo medico puede
   * trabajar en varios consultorios: el token lleva siempre el consultorio activo.
   */
  @Post('switch-clinic')
  async switchClinic(@Body() dto: SwitchClinicDto, @CurrentUser() user: CurrentUserData) {
    return await this.authService.switchClinic(user.userId, dto.clinicId);
  }

  @Get('profile')
  async getProfile(@CurrentUser() user: CurrentUserData) {
    return detailResponse(await this.authService.getProfile(user.userId, user.clinicId));
  }
}
