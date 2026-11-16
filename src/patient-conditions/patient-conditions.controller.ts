import { Controller, Delete, Get, Param, Post, Put, Query, Body } from '@nestjs/common';
import { PatientConditionsService } from './patient-conditions.service';
import {
  ClinicalSummaryQueryDto,
  CreatePatientConditionDto,
  PatientConditionListQueryDto,
  UpdatePatientConditionDto,
} from './patient-conditions.dto';
import { CurrentUser, CurrentUserData } from '../common/decorators/current-user.decorator';
import { detailResponse } from '../common/api-response';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../generated/prisma/client';

@Controller('patients/:patientId/conditions')
export class PatientConditionsController {
  constructor(private readonly patientConditionsService: PatientConditionsService) {}

  @Get()
  async findAll(
    @Param('patientId') patientId: string,
    @Query() query: PatientConditionListQueryDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.patientConditionsService.findAll(patientId, user.clinicId, query);
  }

  @Get(':conditionId')
  async findOne(
    @Param('patientId') patientId: string,
    @Param('conditionId') conditionId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return detailResponse(
      await this.patientConditionsService.findOne(patientId, conditionId, user.clinicId),
    );
  }

  @Roles(Role.DOCTOR)
  @Post()
  async create(
    @Param('patientId') patientId: string,
    @Body() dto: CreatePatientConditionDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.patientConditionsService.create(
      patientId,
      dto,
      user.clinicId,
      user.userId,
    );
  }

  @Roles(Role.DOCTOR)
  @Put(':conditionId')
  async update(
    @Param('patientId') patientId: string,
    @Param('conditionId') conditionId: string,
    @Body() dto: UpdatePatientConditionDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.patientConditionsService.update(
      patientId,
      conditionId,
      dto,
      user.clinicId,
      user.userId,
    );
  }

  @Roles(Role.DOCTOR)
  @Delete(':conditionId')
  async deactivate(
    @Param('patientId') patientId: string,
    @Param('conditionId') conditionId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.patientConditionsService.deactivate(
      patientId,
      conditionId,
      user.clinicId,
      user.userId,
    );
  }
}

@Controller('patients/:patientId')
export class PatientClinicalSummaryController {
  constructor(private readonly patientConditionsService: PatientConditionsService) {}

  @Get('clinical-summary')
  async getClinicalSummary(
    @Param('patientId') patientId: string,
    @Query() query: ClinicalSummaryQueryDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return detailResponse(
      await this.patientConditionsService.getClinicalSummary(
        patientId,
        user.clinicId,
        query,
      ),
    );
  }
}
