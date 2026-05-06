import { Module } from '@nestjs/common';
import { ServicesCostsController } from './services-costs.controller';
import { ServicesCostsService } from './services-costs.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [ServicesCostsController],
  providers: [ServicesCostsService, PrismaService]
})
export class ServicesCostsModule {}
