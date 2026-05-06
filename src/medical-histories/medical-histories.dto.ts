import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

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