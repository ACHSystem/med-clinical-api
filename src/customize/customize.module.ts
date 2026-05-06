import { Module } from '@nestjs/common';
import { CustomizeController } from './customize.controller';
import { CustomizeService } from './customize.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [CustomizeController],
  providers: [CustomizeService, PrismaService]
})
export class CustomizeModule {}
