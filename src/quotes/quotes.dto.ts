import { IsBoolean, IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateQuoteItemDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @IsOptional()
  quantity?: number;

  @IsNumber()
  @IsNotEmpty()
  unitPrice: number;
}

export class CreateQuoteDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsDateString()
  @IsOptional()
  validUntil?: string;

  @IsNumber()
  @IsNotEmpty()
  total: number;

  @IsUUID()
  @IsNotEmpty()
  patientId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuoteItemDto)
  items: CreateQuoteItemDto[];
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
  validUntil?: string;

  @IsNumber()
  @IsOptional()
  total?: number;

  @IsString()
  @IsOptional()
  status?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}