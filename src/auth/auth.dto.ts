import { IsEmail, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  username!: string;

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
  @MinLength(8)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'La contraseña debe tener al menos 8 caracteres, una letra y un número',
  })
  password!: string;

  @IsString()
  @IsNotEmpty()
  username!: string;

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
