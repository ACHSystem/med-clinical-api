import { Transform } from 'class-transformer';
import { IsBoolean, IsDate, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto, parseBooleanQuery } from '../common/pagination.dto';

export class ServiceCostListQueryDto extends PaginationQueryDto {
  @Transform(parseBooleanQuery)
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @Transform(({ value }) => (value === '' ? undefined : Number(value)))
  @IsNumber()
  @IsOptional()
  minPrice?: number;

  @Transform(({ value }) => (value === '' ? undefined : Number(value)))
  @IsNumber()
  @IsOptional()
  maxPrice?: number;
}

export class ServiceCostDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @IsNotEmpty()
  price!: number;
}

export class DolarDTO {
  @IsNumber()
  value!: number;
  @IsDate()
  @Transform(({ value }) => new Date(value))
  date!: Date;
}
export interface IDolar {
  moneda: string;
  fuente: string;
  nombre: string;
  compra: null,
  venta: null,
  promedio: number;
  fechaActualizacion: Date
}