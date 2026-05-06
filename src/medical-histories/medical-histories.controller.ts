import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { MedicalHistoriesService } from './medical-histories.service';
import { CreateMedicalHistoryDto, UpdateMedicalHistoryDto } from './medical-histories.dto';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser, CurrentUserData } from '../common/decorators/current-user.decorator';

@Controller('medical-histories')
export class MedicalHistoriesController {
  constructor(private medicalHistoriesService: MedicalHistoriesService) {}

  @Get('patient/:patientId')
  async findAllByPatient(@Param('patientId') patientId: string, @CurrentUser() user: CurrentUserData) {
    return await this.medicalHistoriesService.findAllByPatient(patientId, user.userId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return await this.medicalHistoriesService.findOne(id, user.userId);
  }

  @Post()
  async create(@Body() dto: CreateMedicalHistoryDto, @CurrentUser() user: CurrentUserData) {
    return await this.medicalHistoriesService.create(dto, user.userId);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateMedicalHistoryDto, @CurrentUser() user: CurrentUserData) {
    return await this.medicalHistoriesService.update(id, dto, user.userId);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return await this.medicalHistoriesService.remove(id, user.userId);
  }
}