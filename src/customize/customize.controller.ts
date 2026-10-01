import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseArrayPipe } from '@nestjs/common';
import { CustomizeService } from './customize.service';
import {
  CustomFieldDto,
  FormTemplateDto,
  CustomFieldListQueryDto,
  FormTemplateListQueryDto,
  ReorderCustomFieldDto,
  UpdateCustomFieldDto,
  UpdateFormTemplateDto,
} from './customize.dto';
import { CurrentUser, CurrentUserData } from '../common/decorators/current-user.decorator';

@Controller('customize')
export class CustomizeController {
  constructor(private customizeService: CustomizeService) {}

  @Get()
  async getFormTemplates(@Query() query: FormTemplateListQueryDto, @CurrentUser() user: CurrentUserData) {
    return await this.customizeService.getFormTemplates(user.clinicId, query);
  }

  @Post('templates')
  async createTemplate(@Body() dto: FormTemplateDto, @CurrentUser() user: CurrentUserData) {
    return await this.customizeService.createTemplate(dto, user.clinicId);
  }

  @Put('templates/:id')
  async updateTemplate(
    @Param('id') id: string,
    @Body() dto: UpdateFormTemplateDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return await this.customizeService.updateTemplate(id, dto, user.clinicId);
  }

  @Delete('templates/:id')
  async deactivateTemplate(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return await this.customizeService.deactivateTemplate(id, user.clinicId);
  }

  @Get('fields')
  async getFields(@Query() query: CustomFieldListQueryDto, @CurrentUser() user: CurrentUserData) {
    return await this.customizeService.getFields(user.clinicId, query);
  }

  @Post('fields')
  async createField(@Body() dto: CustomFieldDto, @CurrentUser() user: CurrentUserData) {
    return await this.customizeService.create(dto, user.clinicId);
  }

  @Put('fields/reorder')
  async reorderFields(
    @Body(new ParseArrayPipe({ items: ReorderCustomFieldDto })) fields: ReorderCustomFieldDto[],
    @CurrentUser() user: CurrentUserData,
  ) {
    return await this.customizeService.reorder(fields, user.clinicId);
  }

  @Get('fields/:id')
  async findField(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return await this.customizeService.findOne(id, user.clinicId);
  }

  @Put('fields/:id')
  async updateField(
    @Param('id') id: string,
    @Body() dto: UpdateCustomFieldDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return await this.customizeService.update(id, dto, user.clinicId);
  }

  @Delete('fields/:id')
  async removeField(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return await this.customizeService.remove(id, user.clinicId);
  }

  // Legacy field routes remain available for existing clients.
  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return await this.customizeService.findOne(id, user.clinicId);
  }

  @Post()
  async create(@Body() dto: CustomFieldDto, @CurrentUser() user: CurrentUserData) {
    return await this.customizeService.create(dto, user.clinicId);
  }

  @Put('reorder')
  async reorder(
    @Body(new ParseArrayPipe({ items: ReorderCustomFieldDto })) fields: ReorderCustomFieldDto[],
    @CurrentUser() user: CurrentUserData,
  ) {
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