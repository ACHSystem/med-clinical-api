import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import {
  AppointmentListQueryDto,
  AttendAppointmentDto,
  CreateAppointmentDto,
  RescheduleAppointmentDto,
  UpdateAppointmentDto,
} from './appointments.dto';
import {
  CurrentUser,
  CurrentUserData,
} from '../common/decorators/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../generated/prisma/client';

@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Get()
  async getAll(
    @Query() query: AppointmentListQueryDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.appointmentsService.getAllAppointments(user.clinicId, query);
  }

  @Get(':id/reschedules')
  async getRescheduleHistory(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.appointmentsService.getRescheduleHistory(id, user.clinicId);
  }

  @Get(':id')
  async getOne(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.appointmentsService.getOne(id, user.clinicId);
  }

  @Post()
  async create(
    @Body() dto: CreateAppointmentDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.appointmentsService.create(dto, user.clinicId, user.userId);
  }

  @Put(':id/confirm')
  async confirm(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.appointmentsService.confirm(id, user.clinicId, user.userId);
  }

  @Roles(Role.DOCTOR)
  @Put(':id/attend')
  async attend(
    @Param('id') id: string,
    @Body() dto: AttendAppointmentDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.appointmentsService.attend(id, dto, user.clinicId, user.userId);
  }

  @Put(':id/no-show')
  async noShow(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.appointmentsService.noShow(id, user.clinicId, user.userId);
  }

  @Put(':id/cancel')
  async cancel(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.appointmentsService.cancel(id, user.clinicId, user.userId);
  }

  @Put(':id/reschedule')
  async reschedule(
    @Param('id') id: string,
    @Body() dto: RescheduleAppointmentDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.appointmentsService.reschedule(
      id,
      dto,
      user.clinicId,
      user.userId,
    );
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAppointmentDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.appointmentsService.update(id, dto, user.clinicId, user.userId);
  }

  @Roles(Role.DOCTOR)
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.appointmentsService.remove(id, user.clinicId, user.userId);
  }
}
