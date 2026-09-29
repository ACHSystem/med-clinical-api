import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { LoginDto, RegisterDto } from './auth.dto';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {

  private secretKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.secretKey = this.configService.getOrThrow<string>('JWT_SECRET');
  }

  async login(credentials: LoginDto) {
    const { email, password } = credentials;
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Mismo mensaje para usuario inexistente y contraseña incorrecta: no enumerar cuentas
    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Usuario inactivo');
    }

    const payload = { sub: user.id, email: user.email, role: user.role };

    const access_token = jwt.sign(payload, this.secretKey, { expiresIn: '7d' });
    return {
      success: true,
      message: `Bienvenido ${user.name}`,
      data: {
        access_token: access_token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      }
    };
  }

  async register(register: RegisterDto) {
    const { email, password, name, lastName } = register;
    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new BadRequestException('El email ya está registrado');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await this.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        lastName,
      },
    });

    const payload = { sub: user.id, email: user.email, role: user.role };
    return {
      success: true,
      message: `Usuario ${user.name} registrado exitosamente`,
      data: {
        access_token: jwt.sign(payload, this.secretKey, { expiresIn: '7d' }),
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      }
    };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }
}