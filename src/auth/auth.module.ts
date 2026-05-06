import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { AuthGuard } from './auth.guard';
import { PrismaService } from 'src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
@Module({
  controllers: [AuthController],
  providers: [AuthService, JwtService, JwtStrategy, AuthGuard, PrismaService],
  exports: [AuthGuard],
})
export class AuthModule { }