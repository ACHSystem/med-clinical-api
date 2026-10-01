import { Injectable, UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { LoginDto, RegisterDto } from './auth.dto';
import { ConfigService } from '@nestjs/config';

/** Claims del token. `clinicId` es el consultorio ACTIVO: el tenant de la peticion. */
export interface AccessTokenPayload {
  sub: string;
  email: string;
  username: string;
  role: string;
  clinicId: string;
}

@Injectable()
export class AuthService {

  private secretKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.secretKey = this.configService.getOrThrow<string>('JWT_SECRET');
  }

  private signToken(user: { id: string; email: string; username: string; role: string }, clinicId: string) {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      clinicId,
    };
    return jwt.sign(payload, this.secretKey, { expiresIn: '7d' });
  }

  private async memberships(userId: string) {
    return this.prisma.clinicUser.findMany({
      where: { userId, isActive: true, clinic: { isActive: true } },
      include: { clinic: true },
      orderBy: { clinic: { createdAt: 'asc' } },
    });
  }

  async login(credentials: LoginDto) {
    const { username, password } = credentials;
    const user = await this.prisma.user.findUnique({ where: { username } });

    // Mismo mensaje para usuario inexistente y contrasena incorrecta: no enumerar cuentas
    if (!user) {
      throw new UnauthorizedException('Usuario inválido');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Usuario inactivo');
    }

    const memberships = await this.memberships(user.id);
    if (memberships.length === 0) {
      throw new UnauthorizedException('El usuario no pertenece a ningún consultorio');
    }

    // Si el usuario trabaja en varios consultorios, entra al mas antiguo; el
    // frontend llama a /auth/switch-clinic para cambiar.
    const active = memberships[0];

    return {
      success: true,
      message: `Bienvenido ${user.name} ${user.lastName}`,
      data: {
        access_token: this.signToken(user, active.clinicId),
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          name: user.name,
          role: user.role,
        },
        clinic: {
          id: active.clinicId,
          name: active.clinic.name,
          role: active.role,
        },
        clinics: memberships.map((m) => ({
          id: m.clinicId,
          name: m.clinic.name,
          role: m.role,
        })),
      },
    };
  }

  async register(register: RegisterDto) {
    const { email, password, name, lastName, username } = register;
    const existingUser = await this.prisma.user.findUnique({ where: { username } });
    if (existingUser) {
      throw new BadRequestException('El nombre de usuario ya está registrado');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await this.prisma.user.create({
      data: { email, username, password: hashedPassword, name, lastName },
    });

    // Si no se indica consultorio, se usa el del admin que esta registrando.
    const clinicId = register.clinicId;
    if (!clinicId) {
      throw new BadRequestException('Debe indicar el consultorio donde se asigna el usuario');
    }

    const membership = await this.prisma.clinicUser.create({
      data: { clinicId, userId: user.id, role: 'ASSISTANT', isActive: true },
      include: { clinic: true },
    });

    return {
      success: true,
      message: `Usuario ${user.name} registrado exitosamente`,
      data: {
        access_token: this.signToken(user, membership.clinicId),
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          name: user.name,
          lastName: user.lastName,
          role: user.role,
        },
        clinic: {
          id: membership.clinicId,
          name: membership.clinic.name,
          role: membership.role,
        },
        clinics: [{ id: membership.clinicId, name: membership.clinic.name, role: membership.role }],
      },
    };
  }

  async getClinics(userId: string) {
    const memberships = await this.memberships(userId);
    return memberships.map((m) => ({
      id: m.clinicId,
      name: m.clinic.name,
      role: m.role,
      isActive: m.clinic.isActive,
    }));
  }

  async switchClinic(userId: string, clinicId: string) {
    const membership = await this.prisma.clinicUser.findFirst({
      where: { userId, clinicId, isActive: true, clinic: { isActive: true } },
      include: { clinic: true, user: true },
    });

    // 404 y no 403: no revelamos si ese consultorio existe pero no es suyo
    if (!membership) {
      throw new NotFoundException('Consultorio no encontrado');
    }

    return {
      success: true,
      message: `Consultorio activo: ${membership.clinic.name}`,
      data: {
        access_token: this.signToken(membership.user, membership.clinicId),
        clinic: {
          id: membership.clinicId,
          name: membership.clinic.name,
          role: membership.role,
        },
      },
    };
  }

  async getProfile(userId: string, clinicId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { memberships: { where: { clinicId, isActive: true }, include: { clinic: true } } },
    });
    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }
    const membership = user.memberships[0];
    return {
      id: user.id,
      email: user.email,  
      name: user.name,
      lastName: user.lastName,
      username: user.username,
      role: user.role,
      clinic: membership
        ? { id: membership.clinicId, name: membership.clinic.name, role: membership.role }
        : null,
    };
  }
}
