import { Module } from '@nestjs/common';
import {
  PatientClinicalSummaryController,
  PatientConditionsController,
} from './patient-conditions.controller';
import { PatientConditionsService } from './patient-conditions.service';

@Module({
  controllers: [PatientConditionsController, PatientClinicalSummaryController],
  providers: [PatientConditionsService],
  exports: [PatientConditionsService],
})
export class PatientConditionsModule {}
