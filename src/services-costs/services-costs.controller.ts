import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ServicesCostsService } from './services-costs.service';
import { ServiceCostDto, ServiceCostListQueryDto } from './services-costs.dto';
import { CurrentUser, CurrentUserData } from '../common/decorators/current-user.decorator';

@Controller('services-costs')
export class ServicesCostsController {
  constructor(private servicesCostsService: ServicesCostsService) {}

  @Get()
  async getServicesAndCosts(@Query() query: ServiceCostListQueryDto, @CurrentUser() user: CurrentUserData) {
    return await this.servicesCostsService.getServicesAndCosts(user.clinicId, query);
  }

  @Get('dolar')
  async getDolar() {
    return await this.servicesCostsService.getCurrentDolar();
  }

  /** Consulta una API externa y escribe en la base: 1 por minuto. */
  @Throttle({ short: { limit: 1, ttl: 60_000 } })
  @Get('dolar/save')
  async saveDolar() {
    return await this.servicesCostsService.saveDolarAutomatic();
  }

  @Post()
  async create(@Body() dto: ServiceCostDto, @CurrentUser() user: CurrentUserData) {
    return await this.servicesCostsService.create(dto, user.clinicId);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: ServiceCostDto) {
    return await this.servicesCostsService.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return await this.servicesCostsService.remove(id);
  }
}