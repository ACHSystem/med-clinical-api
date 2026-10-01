import { IsDateString, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
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
  @IsOptional()
  title?: string;

  @IsNotEmpty()
  data!: Record<string, any>;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  templateId?: string;

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