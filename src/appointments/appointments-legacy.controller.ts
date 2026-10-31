import { Controller, Get, Param, Query } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { AppointmentListQueryDto } from './appointments.dto';
import {
  CurrentUser,
  CurrentUserData,
} from '../common/decorators/current-user.decorator';

/**
 * Aliases deprecados que conservan las rutas historicas del frontend.
 * AppointmentsModule debe registrarse antes de PatientsModule (que importa
 * MedicalHistoriesModule) para que estas rutas ganen frente a
 * /medical-histories/:id.
 */
@Controller('medical-histories/appointments')
export class AppointmentsLegacyController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Get()
  async getAll(
    @Query() query: AppointmentListQueryDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.appointmentsService.getAllAppointments(user.clinicId, query);
  }

  @Get(':id')
  async getOne(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.appointmentsService.getOne(id, user.clinicId);
  }
}
