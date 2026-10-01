import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { MedicalHistoriesService } from './medical-histories.service';
import { CreateMedicalHistoryDto, MedicalHistoryListQueryDto, UpdateMedicalHistoryDto } from './medical-histories.dto';
import { CurrentUser, CurrentUserData } from '../common/decorators/current-user.decorator';

@Controller('medical-histories')
export class MedicalHistoriesController {
  constructor(private medicalHistoriesService: MedicalHistoriesService) {}

  @Get()
  async getAllHistories(
    @Query() query: MedicalHistoryListQueryDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return await this.medicalHistoriesService.getAllHistories(user.clinicId, query);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return await this.medicalHistoriesService.findOne(id, user.clinicId);
  }

  @Post()
  async create(@Body() dto: CreateMedicalHistoryDto, @CurrentUser() user: CurrentUserData) {
    return await this.medicalHistoriesService.createMedicalHistory(dto, user.clinicId, user.userId);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateMedicalHistoryDto, @CurrentUser() user: CurrentUserData) {
    return await this.medicalHistoriesService.updateMedicalHistory(id, dto, user.clinicId);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return await this.medicalHistoriesService.deleteMedicalHistory(id, user.clinicId);
  }
}