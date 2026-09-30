import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationQueryDto, parseBooleanQuery } from '../common/pagination.dto';

export class ProviderListQueryDto extends PaginationQueryDto {
  @IsString()
  @IsOptional()
  type?: string;

  @Transform(parseBooleanQuery)
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class ProviderDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  type!: string;

  @IsString()
  @IsNotEmpty()
  businessName!: string;
  
  @IsString()
  @IsNotEmpty()
  identify!: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  description?: string;
}

export class ProviderServiceDto {
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