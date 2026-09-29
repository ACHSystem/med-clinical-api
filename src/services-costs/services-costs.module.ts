import { Module } from '@nestjs/common';
import { ServicesCostsController } from './services-costs.controller';
import { ServicesCostsService } from './services-costs.service';

@Module({
  controllers: [ServicesCostsController],
  providers: [ServicesCostsService]
})
export class ServicesCostsModule {}
