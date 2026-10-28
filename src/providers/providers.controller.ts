import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { ProvidersService } from './providers.service';
import { ProviderDto, ProviderListQueryDto, ProviderServiceDto } from './providers.dto';
import { CurrentUser, CurrentUserData } from '../common/decorators/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../generated/prisma/client';

@Controller('providers')
export class ProvidersController {
  constructor(private providersService: ProvidersService) {}

  @Get()
  async getProviders(@Query() query: ProviderListQueryDto, @CurrentUser() user: CurrentUserData) {
    return await this.providersService.getProviders(user.clinicId, query);
  }

  @Roles(Role.DOCTOR)
  @Post()
  async create(@Body() dto: ProviderDto, @CurrentUser() user: CurrentUserData) {
    return await this.providersService.createProvider(dto, user.clinicId);
  }

  @Roles(Role.DOCTOR)
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: ProviderDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return await this.providersService.updateProvider(id, dto, user.clinicId);
  }

  @Roles(Role.DOCTOR)
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return await this.providersService.removeProvider(id, user.clinicId);
  }

  @Roles(Role.DOCTOR)
  @Post(':id/services')
  async createService(
    @Param('id') id: string,
    @Body() dto: ProviderServiceDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return await this.providersService.createService(id, dto, user.clinicId);
  }

  @Roles(Role.DOCTOR)
  @Put('services/:serviceId')
  async updateService(
    @Param('serviceId') serviceId: string,
    @Body() dto: ProviderServiceDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return await this.providersService.updateService(serviceId, dto, user.clinicId);
  }

  @Roles(Role.DOCTOR)
  @Delete('services/:serviceId')
  async removeService(
    @Param('serviceId') serviceId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return await this.providersService.removeService(serviceId, user.clinicId);
  }
}