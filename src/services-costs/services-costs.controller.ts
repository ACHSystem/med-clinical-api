import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ServicesCostsService } from './services-costs.service';
import { ServiceCostDto } from './services-costs.dto';

@Controller('services-costs')
export class ServicesCostsController {
  constructor(private servicesCostsService: ServicesCostsService) {}

  @Get()
  async getServicesAndCosts() {
    return await this.servicesCostsService.getServicesAndCosts();
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
  async create(@Body() dto: ServiceCostDto) {
    return await this.servicesCostsService.create(dto);
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