import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class PaymentMethodDto {
  @IsString()
  @IsNotEmpty()
  bank!: string;
  
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