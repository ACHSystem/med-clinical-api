import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ServicesCostsService } from './services-costs.service';
import { DolarDTO, ServiceCostDto, ServiceCostListQueryDto } from './services-costs.dto';
import { CurrentUser, CurrentUserData } from '../common/decorators/current-user.decorator';
import { detailResponse } from '../common/api-response';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../generated/prisma/client';

@Controller('services-costs')
export class ServicesCostsController {
  constructor(private servicesCostsService: ServicesCostsService) {}

  @Get()
  async getServicesAndCosts(@Query() query: ServiceCostListQueryDto, @CurrentUser() user: CurrentUserData) {
    return await this.servicesCostsService.getServicesAndCosts(user.clinicId, query);
  }

  @Get('dolar')
  async getDolar() {
    return detailResponse(await this.servicesCostsService.getCurrentDolar());
  }

  @Roles(Role.DOCTOR)
  @Post('dolar')
  async saveDolar(@Body() dto: DolarDTO) {
    return await this.servicesCostsService.saveDolar(dto);
  }

  /** Consulta una API externa y escribe en la base: 1 por minuto. */
  @Roles(Role.DOCTOR)
  @Throttle({ short: { limit: 1, ttl: 60_000 } })
  @Post('dolar/save')
  async saveDolarAutomatic() {
    return await this.servicesCostsService.saveDolarAutomatic();
  }

  @Roles(Role.DOCTOR)
  @Post()
  async create(@Body() dto: ServiceCostDto, @CurrentUser() user: CurrentUserData) {
    return await this.servicesCostsService.create(dto, user.clinicId);
  }

  @Roles(Role.DOCTOR)
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: ServiceCostDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return await this.servicesCostsService.update(id, dto, user.clinicId);
  }

  @Roles(Role.DOCTOR)
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return await this.servicesCostsService.remove(id, user.clinicId);
  }
}
