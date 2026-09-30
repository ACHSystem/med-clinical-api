import { IsDateString, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../common/pagination.dto';

export class MedicalHistoryListQueryDto extends PaginationQueryDto {
  @IsString()
  @IsOptional()
  type?: string;

  @IsDateString()
  @IsOptional()
  createdFrom?: string;

  @IsDateString()
  @IsOptional()
  createdTo?: string;
}

export class CreateMedicalHistoryDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsNotEmpty()
  data: Record<string, any>;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsUUID()
  @IsNotEmpty()
  patientId: string;
}

export class UpdateMedicalHistoryDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsOptional()
  data?: Record<string, any>;

  @IsString()
  @IsOptional()
  notes?: string;
}