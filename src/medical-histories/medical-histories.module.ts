import { Module } from '@nestjs/common';
import { MedicalHistoriesController } from './medical-histories.controller';
import { MedicalHistoriesService } from './medical-histories.service';
import { MedicalHistoryWriterModule } from './medical-history-writer.module';

@Module({
  imports: [MedicalHistoryWriterModule],
  controllers: [MedicalHistoriesController],
  providers: [MedicalHistoriesService],
  exports: [MedicalHistoriesService], // Export the service to be used in other modules
})
export class MedicalHistoriesModule {}
