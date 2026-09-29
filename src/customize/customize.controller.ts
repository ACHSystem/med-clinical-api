import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { CustomizeService } from './customize.service';
import { CreateCustomFieldDto, UpdateCustomFieldDto } from './customize.dto';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser, CurrentUserData } from '../common/decorators/current-user.decorator';

@Controller('customize')
export class CustomizeController {
  constructor(private customizeService: CustomizeService) {}

  @Get()
  async findAll(@CurrentUser() user: CurrentUserData) {
    return await this.customizeService.findAll(user.clinicId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return await this.customizeService.findOne(id, user.clinicId);
  }

  @Post()
  async create(@Body() dto: CreateCustomFieldDto, @CurrentUser() user: CurrentUserData) {
    return await this.customizeService.create(dto, user.clinicId);
  }

  @Put('reorder')
  async reorder(@Body() fields: { id: string; sortOrder: number; step: number }[], @CurrentUser() user: CurrentUserData) {
    return await this.customizeService.reorder(fields, user.clinicId);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateCustomFieldDto, @CurrentUser() user: CurrentUserData) {
    return await this.customizeService.update(id, dto, user.clinicId);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return await this.customizeService.remove(id, user.clinicId);
  }
}