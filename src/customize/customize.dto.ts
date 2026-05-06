import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

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