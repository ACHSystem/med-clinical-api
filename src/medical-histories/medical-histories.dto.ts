import { IsDateString, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../common/pagination.dto';

export class MedicalHistoryListQueryDto extends PaginationQueryDto {
  @IsString()
  @IsOptional()
  type?: string;

  @IsUUID()
  @IsOptional()
  patientId?: string;

  @IsDateString()
  @IsOptional()
  dateStart?: string;

  @IsDateString()
  @IsOptional()
  dateTo?: string;
}

export class CreateMedicalHistoryDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  type!: string;

  @IsString()
  reason!: string;

  @IsString()
  symptoms!: string;

  @IsString()
  notes!: string;

  @IsString()
  observations!: string;

  @IsString()
  diagnosis!: string;

  @IsString()
  evaluation!: string;

  @IsDateString()
  date!: string;

  @IsString()
  @IsNotEmpty()
  status!: string;

  @IsObject()
  @IsOptional()
  vitalSigns?: Record<string, any>;

  @IsObject()
  @IsOptional()
  data?: Record<string, any>;

  @IsUUID()
  @IsOptional()
  templateId?: string;

  @IsObject()
  @IsOptional()
  templateSnapshot?: Record<string, any>;

  @IsUUID()
  @IsNotEmpty()
  patientId!: string;
}

export class UpdateMedicalHistoryDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsOptional()
  data?: Record<string, any>;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  templateId?: string;
}


export const MedicalHistoryStatus = {
  DRAFT: 'DRAFT',
  COMPLETED: 'COMPLETED',
  AMENDED: 'AMENDED',
  CANCELLED: 'CANCELLED',
  ARCHIVED: 'ARCHIVED',
} as const;

export const MedicalHistoryType = {
  GENERAL_CONSULT: 'Consulta general',
  FOLLOW_UP: 'Seguimiento / control',
  SPECIALIST_CONSULT: 'Consulta de especialista',
  INTERCONSULT: 'Interconsulta con otro especialista',
  EMERGENCY: 'Emergencia',
  PROCEDURE: 'Procedimiento menor en consultorio',
  TELEMEDICINE: 'Consulta remota',
  POST_OP_FOLLOW_UP: 'Control postoperatorio',
  LAB_REVIEW: 'Revisión de resultados'
} as const