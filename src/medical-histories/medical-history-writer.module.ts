import { Module } from '@nestjs/common';
import { MedicalHistoryWriterService } from './medical-history-writer.service';

@Module({
  providers: [MedicalHistoryWriterService],
  exports: [MedicalHistoryWriterService],
})
export class MedicalHistoryWriterModule {}
