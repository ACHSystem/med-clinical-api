import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { PatientsService } from './patients.service';
import { CreatePatientDto, PatientListQueryDto, UpdatePatientDto } from './patients.dto';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser, CurrentUserData } from '../common/decorators/current-user.decorator';

@Controller('patients')
export class PatientsController {
  constructor(private patientsService: PatientsService) {}

  @Get()
  async getPatients(@Query() query: PatientListQueryDto, @CurrentUser() user: CurrentUserData) {
    return await this.patientsService.getPatients(user.clinicId, query);
  }

  @Get(':id/medical-histories')
  async getPatientMedicalHistories(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return await this.patientsService.getPatientMedicalHistories(id, user.clinicId);
  }

  @Get(':id')
  async getPatient(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return await this.patientsService.findOne(id, user.clinicId);
  }

  @Post()
  async create(@Body() dto: CreatePatientDto, @CurrentUser() user: CurrentUserData) {
    return await this.patientsService.createPatient(dto, user.clinicId);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdatePatientDto, @CurrentUser() user: CurrentUserData) {
    return await this.patientsService.updatePatient(id, dto, user.clinicId);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return await this.patientsService.deletePatient(id, user.clinicId);
  }
}