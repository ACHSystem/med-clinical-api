import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { PatientsService } from './patients.service';
import { CreatePatientDto, UpdatePatientDto } from './patients.dto';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser, CurrentUserData } from '../common/decorators/current-user.decorator';

@Controller('patients')
export class PatientsController {
  constructor(private patientsService: PatientsService) {}

  @Get()
  async getPatients(@CurrentUser() user: CurrentUserData) {
    return await this.patientsService.getPatients(user.clinicId);
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
    return await this.patientsService.update(id, dto, user.clinicId);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return await this.patientsService.remove(id, user.clinicId);
  }
}