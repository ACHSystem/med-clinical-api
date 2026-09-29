import { Controller, Post, Get, Body } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './auth.dto';
import { CurrentUser, CurrentUserData } from '../common/decorators/current-user.decorator';

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
  @Post('register')
  async register(@Body() register: RegisterDto) {
    return await this.authService.register(register);
  }

  @Get('profile')
  async getProfile(@CurrentUser() user: CurrentUserData) {
    return await this.authService.getProfile(user.userId);
  }
}