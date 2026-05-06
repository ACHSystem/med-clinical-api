import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class ApiResponseDto<T> {
  @IsBoolean()
  status!: boolean;

  @IsString()
  message!: string;

  @IsOptional()
  data?: T;

  static success<T>(message: string, data?: T): ApiResponseDto<T> {
    return {
      status: true,
      message,
      data,
    };
  }

  static error(message: string): ApiResponseDto<null> {
    return {
      status: false,
      message,
      data: null,
    };
  }
}

export class PaginationDto {
  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;

  @IsOptional()
  total?: number;
}