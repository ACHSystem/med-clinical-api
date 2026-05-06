import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ServicesCostsService } from './services-costs.service';
import { ServiceCostDto } from './services-costs.dto';
import { AuthGuard } from '../auth/auth.guard';

@Controller('services-costs')
export class ServicesCostsController {
  constructor(private servicesCostsService: ServicesCostsService) {}

  @Get()
  async getServicesAndCosts() {
    return await this.servicesCostsService.getServicesAndCosts();
  }

  @Get('dolar')
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