import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ProvidersService } from './providers.service';
import { ProviderDto, ProviderServiceDto } from './providers.dto';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser, CurrentUserData } from '../common/decorators/current-user.decorator';

@Controller('providers')
export class ProvidersController {
  constructor(private providersService: ProvidersService) {}

  @Get()
  async getProviders() {
    return await this.providersService.getProviders();
  }

  @Post()
  async create(@Body() dto: ProviderDto, @CurrentUser() user: CurrentUserData) {
    return await this.providersService.create(dto, user.clinicId);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: ProviderDto) {
    return await this.providersService.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return await this.providersService.remove(id);
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