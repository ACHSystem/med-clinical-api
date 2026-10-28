import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';
import { PaginationQueryDto } from '../common/pagination.dto';

export class AppointmentsListQueryDto extends PaginationQueryDto {
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

export class CreateTreatmentMedicationDto {
  @IsUUID()
  @IsOptional()
  medicationId?: string;

  @IsString()
  @IsNotEmpty()
  medicationName!: string;

  @IsString()
  @IsOptional()
  activeIngredient?: string;

  @IsString()
  @IsOptional()
  presentation?: string;

  @IsString()
  @IsOptional()
  concentration?: string;

  @IsString()
  @IsNotEmpty()
  dose!: string;

  @IsString()
  @IsNotEmpty()
  frequency!: string;

  @IsString()
  @IsOptional()
  route?: string;

  @IsString()
  @IsOptional()
  duration?: string;

  @IsString()
  @IsOptional()
  quantity?: string;

  @IsString()
  @IsOptional()
  instructions?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsInt()
  @IsOptional()
  sortOrder?: number;
}

export class CreateMedicalTreatmentDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  plan?: string;

  @IsString()
  @IsOptional()
  recommendations?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsUUID()
  @IsOptional()
  medicationId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTreatmentMedicationDto)
  @IsOptional()
  treatmentMedications?: CreateTreatmentMedicationDto[];
}

export class CreateHistoryAppointmentDto {
  @IsDateString()
  scheduledAt!: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  durationMin?: number;

  @IsDateString()
  @IsOptional()
  confirmedAt?: string;

  @IsDateString()
  @IsOptional()
  attendedAt?: string;

  @IsDateString()
  @IsOptional()
  cancelledAt?: string;

  @IsDateString()
  @IsOptional()
  rescheduledAt?: string;

  @IsString()
  @IsNotEmpty()
  type!: string;

  @IsString()
  @IsNotEmpty()
  status!: string;

  @IsString()
  @IsOptional()
  reason?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsNotEmpty()
  channel!: string;
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

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateMedicalTreatmentDto)
  @IsOptional()
  medicalTreatments?: CreateMedicalTreatmentDto[];

  @ValidateNested()
  @Type(() => CreateHistoryAppointmentDto)
  @IsOptional()
  appointment?: CreateHistoryAppointmentDto;

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

  @IsUUID()
  @IsOptional()
  templateId?: string | null;
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