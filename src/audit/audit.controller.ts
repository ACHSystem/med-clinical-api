import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser, CurrentUserData } from '../common/decorators/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../generated/prisma/client';
import { AuditLogListQueryDto } from './audit.dto';
import { AuditService } from './audit.service';

@Controller('audit-logs')
@Roles(Role.DOCTOR)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  async findAll(
    @Query() query: AuditLogListQueryDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.auditService.findAll(user.clinicId, query);
  }
}
