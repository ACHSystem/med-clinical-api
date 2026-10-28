import { Transform } from 'class-transformer';
import { Equals, IsBoolean, IsDateString, IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto, parseBooleanQuery } from '../common/pagination.dto';

export class PatientListQueryDto extends PaginationQueryDto {
  @IsString()
  @IsOptional()
  gender?: string;

  @Transform(parseBooleanQuery)
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class PatientDetailQueryDto {
  @Transform(parseBooleanQuery)
  @IsBoolean()
  @IsOptional()
  includeInactive?: boolean;
}

export class PatientDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @IsString()
  @IsNotEmpty()
  identify!: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsDateString()
  @IsOptional()
  birthDate?: string;

  @IsString()
  @IsOptional()
  gender?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdatePatientDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  lastName?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  identify?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsDateString()
  @IsOptional()
  birthDate?: string;

  @IsString()
  @IsOptional()
  gender?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsBoolean()
  @Equals(true)
  @IsOptional()
  isActive?: boolean;
}
