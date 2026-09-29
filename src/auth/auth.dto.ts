import { IsEmail, IsNotEmpty, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class RegisterDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  lastName!: string;

  /**
   * Consultorio en el que se da de alta al usuario. Si se omite se usa el
   * consultorio activo de quien lo registra.
   */
  @IsUUID()
  @IsOptional()
  clinicId?: string;
}

export class SwitchClinicDto {
  @IsUUID()
  @IsNotEmpty()
  clinicId!: string;
}
