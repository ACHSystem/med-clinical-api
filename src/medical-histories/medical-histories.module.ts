import { Module } from '@nestjs/common';
import { MedicalHistoriesController } from './medical-histories.controller';
import { MedicalHistoriesService } from './medical-histories.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [MedicalHistoriesController],
  providers: [MedicalHistoriesService, PrismaService]
})
export class MedicalHistoriesModule {}
