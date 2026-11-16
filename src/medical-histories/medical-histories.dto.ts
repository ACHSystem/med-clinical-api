import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { MedicalHistoryStatus } from '../generated/prisma/client';
import { PaginationQueryDto } from '../common/pagination.dto';
import { normalizeMedicalHistoryStatus } from './medical-history-status';

export { MedicalHistoryStatus };

const trimUpperSlash = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().replace(/\s*\/\s*/, '/') : value;

const emptyToUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const toOptionalNumber = ({ value }: { value: unknown }) => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed.replace(',', '.'));
    return Number.isNaN(parsed) ? value : parsed;
  }
  return value;
};

export class VitalSignsDto {
  @Transform(trimUpperSlash)
  @Matches(/^\d{2,3}\/\d{2,3}$/, {
    message: 'ta debe tener el formato sistólica/diastólica (ej. 120/80)',
  })
  @MaxLength(20)
  @IsOptional()
  ta?: string;

  @Transform(toOptionalNumber)
  @IsNumber({}, { message: 'fc debe ser numérico' })
  @IsOptional()
  fc?: number;

  @Transform(toOptionalNumber)
  @IsNumber({}, { message: 'fr debe ser numérico' })
  @IsOptional()
  fr?: number;

  @Transform(toOptionalNumber)
  @IsNumber({}, { message: 'temp debe ser numérico' })
  @IsOptional()
  temp?: number;

  @Transform(toOptionalNumber)
  @IsNumber({}, { message: 'peso debe ser numérico' })
  @IsOptional()
  peso?: number;

  @Transform(toOptionalNumber)
  @IsNumber({}, { message: 'talla debe ser numérico' })
  @IsOptional()
  talla?: number;

  /** Calculado por el servidor; se acepta por compatibilidad y se ignora. */
  @Transform(toOptionalNumber)
  @IsNumber({}, { message: 'imc debe ser numérico' })
  @IsOptional()
  imc?: number;

  @Transform(toOptionalNumber)
  @IsNumber({}, { message: 'spo2 debe ser numérico' })
  @IsOptional()
  spo2?: number;

  /** Compatibilidad con historias viejas que guardaban texto libre. */
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  signos?: string;
}

export class MedicalHistoryListQueryDto extends PaginationQueryDto {
  @IsString()
  @IsOptional()
  type?: string;

  @Transform(({ value }) => normalizeMedicalHistoryStatus(value))
  @IsEnum(MedicalHistoryStatus, {
    message: `status debe ser uno de: ${Object.values(MedicalHistoryStatus).join(', ')}`,
  })
  @IsOptional()
  status?: MedicalHistoryStatus;

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

export class MedicalHistoryPayloadDto {
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

  @Transform(({ value }) => normalizeMedicalHistoryStatus(value))
  @IsEnum(MedicalHistoryStatus, {
    message: `status debe ser uno de: ${Object.values(MedicalHistoryStatus).join(', ')}`,
  })
  @IsOptional()
  status?: MedicalHistoryStatus;

  @ValidateNested()
  @Type(() => VitalSignsDto)
  @IsOptional()
  vitalSigns?: VitalSignsDto;

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
}

export class CreateMedicalHistoryDto extends MedicalHistoryPayloadDto {
  @IsUUID()
  @IsNotEmpty()
  patientId!: string;
}

/**
 * Edición de una historia en DRAFT. No acepta status, patientId, clinicId ni
 * datos de firma: el estado solo cambia por los endpoints de transición.
 */
export class UpdateMedicalHistoryDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  title?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  type?: string;

  @IsString()
  @IsOptional()
  reason?: string;

  @IsString()
  @IsOptional()
  symptoms?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  observations?: string;

  @IsString()
  @IsOptional()
  diagnosis?: string;

  @IsString()
  @IsOptional()
  evaluation?: string;

  @IsDateString()
  @IsOptional()
  date?: string;

  @ValidateNested()
  @Type(() => VitalSignsDto)
  @IsOptional()
  vitalSigns?: VitalSignsDto | null;

  @IsObject()
  @IsOptional()
  data?: Record<string, any> | null;

  @IsUUID()
  @IsOptional()
  templateId?: string | null;

  @IsObject()
  @IsOptional()
  templateSnapshot?: Record<string, any> | null;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateMedicalTreatmentDto)
  @IsOptional()
  medicalTreatments?: CreateMedicalTreatmentDto[];
}

/**
 * Addendum de una historia COMPLETED. Crea una fila AMENDED nueva y firmada;
 * el original no se modifica. `amendReason` es la justificación del addendum.
 */
export class AmendMedicalHistoryDto extends UpdateMedicalHistoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  amendReason!: string;
}

export class CancelMedicalHistoryDto {
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  reason?: string;
}

export const MedicalHistoryType = {
  GENERAL_CONSULT: 'Consulta general',
  FOLLOW_UP: 'Seguimiento / control',
  SPECIALIST_CONSULT: 'Consulta de especialista',
  INTERCONSULT: 'Interconsulta con otro especialista',
  EMERGENCY: 'Emergencia',
  PROCEDURE: 'Procedimiento menor en consultorio',
  TELEMEDICINE: 'Consulta remota',
  POST_OP_FOLLOW_UP: 'Control postoperatorio',
  LAB_REVIEW: 'Revisión de resultados',
} as const;
