import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { PatientsService } from './patients.service';
import { PatientDto, PatientListQueryDto } from './patients.dto';
import { CurrentUser, CurrentUserData } from '../common/decorators/current-user.decorator';
import { PaginationQueryDto } from 'src/common/pagination.dto';

@Controller('patients')
export class PatientsController {
  constructor(private patientsService: PatientsService) {}

  @Get()
  async getPatients(@Query() query: PatientListQueryDto, @CurrentUser() user: CurrentUserData) {
    return await this.patientsService.getPatients(user.clinicId, query);
  }

  @Get('/autocomplete')
  async getPatientSimple(@Query() query: PaginationQueryDto, @CurrentUser() user: CurrentUserData) {
    return await this.patientsService.getPatientSimple(user.clinicId, query);
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
  async create(@Body() dto: PatientDto, @CurrentUser() user: CurrentUserData) {
    return await this.patientsService.createPatient(dto, user.clinicId);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: PatientDto, @CurrentUser() user: CurrentUserData) {
    return await this.patientsService.updatePatient(id, dto, user.clinicId);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return await this.patientsService.deletePatient(id, user.clinicId);
  }
}