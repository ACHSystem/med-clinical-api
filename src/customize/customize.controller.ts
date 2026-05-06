import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { CustomizeService } from './customize.service';
import { CreateCustomFieldDto, UpdateCustomFieldDto } from './customize.dto';
import { AuthGuard } from '../auth/auth.guard';

@Controller('customize')
export class CustomizeController {
  constructor(private customizeService: CustomizeService) {}

  @Get()
  async findAll() {
    return await this.customizeService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.customizeService.findOne(id);
  }

  @Post()
  async create(@Body() dto: CreateCustomFieldDto) {
    return await this.customizeService.create(dto);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateCustomFieldDto) {
    return await this.customizeService.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return await this.customizeService.remove(id);
  }

  @Put('reorder')
  async reorder(@Body() fields: { id: string; sortOrder: number; step: number }[]) {
    return await this.customizeService.reorder(fields);
  }
}