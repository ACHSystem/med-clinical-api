import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { MedicalHistoriesService } from './medical-histories.service';
import { AppointmentsListQueryDto, CreateMedicalHistoryDto, MedicalHistoryListQueryDto, UpdateMedicalHistoryDto } from './medical-histories.dto';
import { CurrentUser, CurrentUserData } from '../common/decorators/current-user.decorator';

@Controller('medical-histories')
export class MedicalHistoriesController {
  constructor(private medicalHistoriesService: MedicalHistoriesService) { }

  @Get()
  async getAllHistories(
    @Query() query: MedicalHistoryListQueryDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return await this.medicalHistoriesService.getAllHistories(user.clinicId, query);
  }

  @Get('/appointments')
  async getAppointments(
    @Query() query: AppointmentsListQueryDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return await this.medicalHistoriesService.getAppointments(user.clinicId, query);
  }

  @Get('/appointments/:id')
  async getAppointmentsById(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return await this.medicalHistoriesService.getAppointmentsById(user.clinicId, id);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return await this.medicalHistoriesService.findOne(id, user.clinicId);
  }

  @Get('/patients/:id')
  async getHistoryByPatient(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return await this.medicalHistoriesService.getHistoryByPatientId({ patientId: id, clinicId: user.clinicId });
  }

  @Post()
  async createMedicalHistory(@Body() dto: CreateMedicalHistoryDto, @CurrentUser() user: CurrentUserData) {
    return await this.medicalHistoriesService.createMedicalHistory(dto, user.clinicId, user.userId);
  }

  @Put(':id')
  async updateMedicalHistory(@Param('id') id: string, @Body() dto: UpdateMedicalHistoryDto, @CurrentUser() user: CurrentUserData) {
    return await this.medicalHistoriesService.updateMedicalHistory(id, dto, user.clinicId);
  }

  @Delete(':id')
  async deleteMedicalHistory(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return await this.medicalHistoriesService.deleteMedicalHistory(id, user.clinicId);
  }
}