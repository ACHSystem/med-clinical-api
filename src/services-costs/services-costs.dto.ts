import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDate, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PaginationQueryDto, parseBooleanQuery } from '../common/pagination.dto';

export class ServiceCostListQueryDto extends PaginationQueryDto {
  @Transform(parseBooleanQuery)
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  priceMin?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  priceMax?: number;
}

export class ServiceCostDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
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