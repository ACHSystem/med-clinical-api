import { Module } from '@nestjs/common';
import { ProvidersController } from './providers.controller';
import { ProvidersService } from './providers.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

@Module({
  controllers: [ProvidersController],
  providers: [ProvidersService, PrismaService, JwtService],
})
export class ProvidersModule {}
