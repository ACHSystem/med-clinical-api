import { IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { AuditAction } from '../generated/prisma/client';
import { PaginationQueryDto } from '../common/pagination.dto';

export class AuditLogListQueryDto extends PaginationQueryDto {
  @IsString()
  @IsOptional()
  entity?: string;

  @IsEnum(AuditAction)
  @IsOptional()
  action?: AuditAction;

  @IsUUID()
  @IsOptional()
  userId?: string;

  @IsDateString()
  @IsOptional()
  dateFrom?: string;

  @IsDateString()
  @IsOptional()
  dateTo?: string;
}
