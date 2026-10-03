import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ProvidersService } from './providers.service';
import { ProviderDto, ProviderListQueryDto, ProviderServiceDto } from './providers.dto';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser, CurrentUserData } from '../common/decorators/current-user.decorator';

@Controller('providers')
export class ProvidersController {
  constructor(private providersService: ProvidersService) {}

  @Get()
  async getProviders(@Query() query: ProviderListQueryDto, @CurrentUser() user: CurrentUserData) {
    return await this.providersService.getProviders(user.clinicId, query);
  }

  @Post()
  async create(@Body() dto: ProviderDto, @CurrentUser() user: CurrentUserData) {
    return await this.providersService.createProvider(dto, user.clinicId);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: ProviderDto) {
    return await this.providersService.updateProvider(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return await this.providersService.removeProvider(id);
  }

  @Post(':id/services')
  async createService(@Param('id') id: string, @Body() dto: ProviderServiceDto) {
    return await this.providersService.createService(id, dto);
  }

  @Put('services/:serviceId')
  async updateService(@Param('serviceId') serviceId: string, @Body() dto: ProviderServiceDto) {
    return await this.providersService.updateService(serviceId, dto);
  }

  @Delete('services/:serviceId')
  async removeService(@Param('serviceId') serviceId: string) {
    return await this.providersService.removeService(serviceId);
  }
}