import {
  ArrayNotEmpty,
  Equals,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import {
  PaginationQueryDto,
  parseBooleanQuery,
} from '../common/pagination.dto';
import { QuoteStatus } from '../generated/prisma/client';

const ISO_CURRENCY = /^[A-Z]{3}$/;

export class QuoteListQueryDto extends PaginationQueryDto {
  @Transform(parseBooleanQuery)
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsEnum(QuoteStatus)
  @IsOptional()
  status?: QuoteStatus;

  @IsUUID()
  @IsOptional()
  patientId?: string;

  @IsUUID()
  @IsOptional()
  paymentMethodId?: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @Matches(ISO_CURRENCY, {
    message: 'currency debe ser un código ISO 4217 de 3 letras',
  })
  @IsOptional()
  currency?: string;

  @IsDateString()
  @IsOptional()
  createdFrom?: string;

  @IsDateString()
  @IsOptional()
  createdTo?: string;

  /** Por defecto la lista solo devuelve la última versión de cada presupuesto. */
  @Transform(parseBooleanQuery)
  @IsBoolean()
  @IsOptional()
  includeSuperseded?: boolean;
}

export class QuoteItemDto {
  /** Ítem referenciado al catálogo de costos de la clínica. */
  @IsUUID()
  @IsOptional()
  serviceCostId?: string;

  /** Ítem referenciado a un servicio de proveedor de la clínica. */
  @IsUUID()
  @IsOptional()
  providerServiceId?: string;

  /** Obligatorio solo para ítems libres. */
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  quantity?: number;

  /** Obligatorio solo para ítems libres. */
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  unitPrice?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;
}

export class CreateQuoteDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsDateString()
  @IsOptional()
  date?: string;

  @IsDateString()
  @IsOptional()
  validUntil?: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @Matches(ISO_CURRENCY, {
    message: 'currency debe ser un código ISO 4217 de 3 letras',
  })
  @IsOptional()
  currency?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  discount?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  tax?: number;

  @IsUUID()
  @IsNotEmpty()
  dolarId!: string;

  @IsUUID()
  @IsNotEmpty()
  patientId!: string;

  @IsUUID()
  @IsOptional()
  paymentMethodId?: string;

  @IsIn([QuoteStatus.DRAFT, QuoteStatus.SENT], {
    message: 'status solo puede ser DRAFT o SENT al crear un presupuesto',
  })
  @IsOptional()
  status?: QuoteStatus;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => QuoteItemDto)
  items!: QuoteItemDto[];
}

export class UpdateQuoteDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsDateString()
  @IsOptional()
  date?: string;

  @IsDateString()
  @IsOptional()
  validUntil?: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @Matches(ISO_CURRENCY, {
    message: 'currency debe ser un código ISO 4217 de 3 letras',
  })
  @IsOptional()
  currency?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  discount?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  tax?: number;

  @IsUUID()
  @IsOptional()
  dolarId?: string;

  @IsUUID()
  @IsOptional()
  paymentMethodId?: string;

  /** Si se envía, reemplaza todos los ítems del borrador en la misma transacción. */
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => QuoteItemDto)
  @IsOptional()
  items?: QuoteItemDto[];

  /** Solo para reactivar un presupuesto dado de baja; no permite desactivar por PUT. */
  @IsBoolean()
  @Equals(true)
  @IsOptional()
  isActive?: boolean;
}
