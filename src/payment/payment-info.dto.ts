import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationQueryDto, parseBooleanQuery } from '../common/pagination.dto';

export class PaymentMethodListQueryDto extends PaginationQueryDto {
  @Transform(parseBooleanQuery)
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class PaymentMethodDto {
  @IsString()
  @IsNotEmpty()
  bank!: string;

  @IsString()
  @IsOptional()
  type?: string;
  
  @IsString()
  @IsNotEmpty()
  identify!: string;

  @IsString()
  @IsOptional()
  phone!: string;
  
  @IsString()
  @IsOptional()
  email!: string;
  
  @IsString()
  @IsOptional()
  account!: string;
}