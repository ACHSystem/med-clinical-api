import { Controller, Get, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import {
  CurrentUser,
  CurrentUserData,
} from '../common/decorators/current-user.decorator';
import { detailResponse } from '../common/api-response';
import { DashboardAgendaQueryDto } from './dashboard.dto';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('agenda')
  async getAgenda(
    @Query() query: DashboardAgendaQueryDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return detailResponse(
      await this.dashboardService.getAgenda(user.clinicId, query),
    );
  }

  @Get()
  async getSummary(@CurrentUser() user: CurrentUserData) {
    return detailResponse(
      await this.dashboardService.getSummary(user.clinicId),
    );
  }
}
