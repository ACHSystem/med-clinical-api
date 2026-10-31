import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../common/pagination.dto';
import { AppointmentStatus } from '../generated/prisma/client';
import { MedicalHistoryPayloadDto } from '../medical-histories/medical-histories.dto';
import {
  APPOINTMENT_CHANNELS,
  APPOINTMENT_TYPES,
  MAX_APPOINTMENT_DURATION_MIN,
  MIN_APPOINTMENT_DURATION_MIN,
} from './appointments.constants';

const ORDER_VALUES = ['asc', 'desc'] as const;

export class AppointmentListQueryDto extends PaginationQueryDto {
  @IsDateString()
  @IsOptional()
  dateStart?: string;

  @IsDateString()
  @IsOptional()
  dateTo?: string;

  @IsEnum(AppointmentStatus)
  @IsOptional()
  status?: AppointmentStatus;

  @IsUUID()
  @IsOptional()
  patientId?: string;

  @IsIn(APPOINTMENT_TYPES, {
    message: `type debe ser uno de: ${APPOINTMENT_TYPES.join(', ')}`,
  })
  @IsOptional()
  type?: string;

  @IsUUID()
  @IsOptional()
  userId?: string;

  @IsIn(ORDER_VALUES, { message: 'order debe ser asc o desc' })
  @IsOptional()
  order?: 'asc' | 'desc';
}

export class CreateAppointmentDto {
  @IsUUID()
  @IsNotEmpty()
  patientId!: string;

  @IsDateString()
  @IsNotEmpty()
  scheduledAt!: string;

  @Type(() => Number)
  @IsInt()
  @Min(MIN_APPOINTMENT_DURATION_MIN)
  @Max(MAX_APPOINTMENT_DURATION_MIN)
  @IsOptional()
  durationMin?: number;

  @IsIn(APPOINTMENT_TYPES, {
    message: `type debe ser uno de: ${APPOINTMENT_TYPES.join(', ')}`,
  })
  @IsOptional()
  type?: string;

  @IsIn(APPOINTMENT_CHANNELS, {
    message: `channel debe ser uno de: ${APPOINTMENT_CHANNELS.join(', ')}`,
  })
  @IsOptional()
  channel?: string;

  @IsString()
  @IsOptional()
  reason?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  /** Médico asignado. Si se omite, se usa el usuario autenticado. */
  @IsUUID()
  @IsOptional()
  userId?: string;

  /** Vincula una historia existente (solo si aún no está ligada a otra cita). */
  @IsUUID()
  @IsOptional()
  medicalHistoryId?: string;
}

export class UpdateAppointmentDto {
  @IsDateString()
  @IsOptional()
  scheduledAt?: string;

  @Type(() => Number)
  @IsInt()
  @Min(MIN_APPOINTMENT_DURATION_MIN)
  @Max(MAX_APPOINTMENT_DURATION_MIN)
  @IsOptional()
  durationMin?: number;

  @IsIn(APPOINTMENT_TYPES, {
    message: `type debe ser uno de: ${APPOINTMENT_TYPES.join(', ')}`,
  })
  @IsOptional()
  type?: string;

  @IsIn(APPOINTMENT_CHANNELS, {
    message: `channel debe ser uno de: ${APPOINTMENT_CHANNELS.join(', ')}`,
  })
  @IsOptional()
  channel?: string;

  @IsString()
  @IsOptional()
  reason?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsUUID()
  @IsOptional()
  userId?: string;
}

export class RescheduleAppointmentDto {
  @IsDateString()
  @IsNotEmpty()
  scheduledAt!: string;

  @Type(() => Number)
  @IsInt()
  @Min(MIN_APPOINTMENT_DURATION_MIN)
  @Max(MAX_APPOINTMENT_DURATION_MIN)
  @IsOptional()
  durationMin?: number;

  @IsIn(APPOINTMENT_TYPES, {
    message: `type debe ser uno de: ${APPOINTMENT_TYPES.join(', ')}`,
  })
  @IsOptional()
  type?: string;

  @IsIn(APPOINTMENT_CHANNELS, {
    message: `channel debe ser uno de: ${APPOINTMENT_CHANNELS.join(', ')}`,
  })
  @IsOptional()
  channel?: string;

  @IsString()
  @IsOptional()
  reason?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  /** Reasigna la cita hija a otro médico de la clínica. */
  @IsUUID()
  @IsOptional()
  userId?: string;
}

export class AttendAppointmentDto {
  /** Historia existente que se asociará a la cita. */
  @IsUUID()
  @IsOptional()
  medicalHistoryId?: string;

  /** Historia nueva que se creará y vinculará en la misma transacción. */
  @ValidateNested()
  @Type(() => MedicalHistoryPayloadDto)
  @IsOptional()
  history?: MedicalHistoryPayloadDto;
}
