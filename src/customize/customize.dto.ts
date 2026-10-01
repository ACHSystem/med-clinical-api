import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto, parseBooleanQuery } from '../common/pagination.dto';

class ActiveQueryDto extends PaginationQueryDto {}

export class FormTemplateListQueryDto extends ActiveQueryDto {
  @IsString()
  @IsOptional()
  condition?: string;

  @IsString()
  @IsOptional()
  type?: string;
}

export class CustomFieldListQueryDto extends ActiveQueryDto {
  @Transform(parseBooleanQuery)
  @IsBoolean()
  @IsOptional()
  isRequired?: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  step?: number;

  @IsString()
  @IsOptional()
  fieldType?: string;

  @IsString()
  @IsOptional()
  templateId?: string;
}

export class FormTemplateDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  condition?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomFieldDto)
  @IsOptional()
  fields?: CustomFieldDto[];
}

export class UpdateFormTemplateDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  condition?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class CustomFieldDto {
  @IsString()
  @IsOptional()
  id?: string;

  @IsString()
  @IsOptional()
  templateId?: string;

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
  @IsArray()
  @IsOptional()
  options?: string[];

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsNotEmpty()
  sortOrder!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsNotEmpty()
  step!: number;

  @IsString()
  @IsOptional()
  unit?: string;

  @IsString()
  @IsOptional()
  helpText?: string;

  @IsString()
  @IsOptional()
  placeholder?: string;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  minValue?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  maxValue?: number;
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
  @IsArray()
  @IsOptional()
  options?: string[];

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  step?: number;

  @IsString()
  @IsOptional()
  unit?: string;

  @IsString()
  @IsOptional()
  helpText?: string;

  @IsString()
  @IsOptional()
  placeholder?: string;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  minValue?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  maxValue?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class ReorderCustomFieldDto {
  @IsString()
  @IsNotEmpty()
  id!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  step!: number;
}