import { Module } from '@nestjs/common';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';
import { MedicalHistoriesModule } from 'src/medical-histories/medical-histories.module';

@Module({
  imports: [MedicalHistoriesModule],
  controllers: [PatientsController],
  providers: [PatientsService],
})
export class PatientsModule {}
