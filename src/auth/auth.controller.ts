import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './auth.dto';
import { AuthGuard } from './auth.guard';
import { CurrentUser, CurrentUserData } from '../common/decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  async login(@Body() credentials: LoginDto) {
    return await this.authService.login(credentials);
  }

  @Post('register')
  async register(@Body() register: RegisterDto) {
    return await this.authService.register(register);
  }
  
  @Get('profile')
  async getProfile(@CurrentUser() user: CurrentUserData) {
    return await this.authService.getProfile(user.userId);
  }
}