import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { Min } from 'class-validator';
import { PaginationQueryDto, parseBooleanQuery } from '../common/pagination.dto';

export class CustomFieldListQueryDto extends PaginationQueryDto {
  @Transform(parseBooleanQuery)
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @Transform(parseBooleanQuery)
  @IsBoolean()
  @IsOptional()
  isRequired?: boolean;

  @IsString()
  @IsOptional()
  fieldType?: string;

  @Type(() => Number)
  @Min(1)
  @IsNumber()
  @IsOptional()
  step?: number;
}

export class CreateCustomFieldDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  fieldType!: string;

  @IsBoolean()
  @IsOptional()
  isRequired?: boolean;

  @IsString({ each: true })
  @IsOptional()
  options?: string[];

  @IsNumber()
  @IsNotEmpty()
  sortOrder!: number;

  @IsNumber()
  @IsNotEmpty()
  step!: number;
}

export class UpdateCustomFieldDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  fieldType?: string;

  @IsBoolean()
  @IsOptional()
  isRequired?: boolean;

  @IsString({ each: true })
  @IsOptional()
  options?: string[];

  @IsNumber()
  @IsOptional()
  sortOrder?: number;

  @IsNumber()
  @IsOptional()
  step?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}