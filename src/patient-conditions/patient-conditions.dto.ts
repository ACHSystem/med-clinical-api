import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PatientConditionKind } from '../generated/prisma/client';
import { PaginationQueryDto, parseBooleanQuery } from '../common/pagination.dto';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreatePatientConditionDto {
  @IsEnum(PatientConditionKind, {
    message: `kind debe ser uno de: ${Object.values(PatientConditionKind).join(', ')}`,
  })
  kind!: PatientConditionKind;

  @Transform(trimString)
  @IsString()
  @MinLength(2, { message: 'label debe tener al menos 2 caracteres' })
  @MaxLength(120)
  label!: string;

  @IsString()
  @MaxLength(2000)
  @IsOptional()
  notes?: string;

  @IsDateString()
  @IsOptional()
  diagnosedAt?: string | null;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  /** Historia de origen. No se puede cambiar después de crear el antecedente. */
  @IsUUID()
  @IsOptional()
  sourceMedicalHistoryId?: string;
}

export class UpdatePatientConditionDto {
  @IsEnum(PatientConditionKind, {
    message: `kind debe ser uno de: ${Object.values(PatientConditionKind).join(', ')}`,
  })
  @IsOptional()
  kind?: PatientConditionKind;

  @Transform(trimString)
  @IsString()
  @MinLength(2, { message: 'label debe tener al menos 2 caracteres' })
  @MaxLength(120)
  @IsOptional()
  label?: string;

  @IsString()
  @MaxLength(2000)
  @IsOptional()
  notes?: string;

  @IsDateString()
  @IsOptional()
  diagnosedAt?: string | null;

  /** `true` reactiva un antecedente desactivado. */
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class PatientConditionListQueryDto extends PaginationQueryDto {
  @IsEnum(PatientConditionKind, {
    message: `kind debe ser uno de: ${Object.values(PatientConditionKind).join(', ')}`,
  })
  @IsOptional()
  kind?: PatientConditionKind;

  @Transform(parseBooleanQuery)
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class ClinicalSummaryQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  timelineLimit = 20;
}
