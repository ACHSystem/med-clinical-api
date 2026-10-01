import { Module } from '@nestjs/common';
import { MedicalHistoriesController } from './medical-histories.controller';
import { MedicalHistoriesService } from './medical-histories.service';

@Module({
  controllers: [MedicalHistoriesController],
  providers: [MedicalHistoriesService],
  exports: [MedicalHistoriesService], // Export the service to be used in other modules
})
export class MedicalHistoriesModule {}
