import { Module } from '@nestjs/common';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsLegacyController } from './appointments-legacy.controller';
import { AppointmentsService } from './appointments.service';
import { MedicalHistoryWriterModule } from '../medical-histories/medical-history-writer.module';

@Module({
  imports: [MedicalHistoryWriterModule],
  controllers: [AppointmentsController, AppointmentsLegacyController],
  providers: [AppointmentsService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
