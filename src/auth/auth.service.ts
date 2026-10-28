import { ConflictException, Injectable, UnauthorizedException, ForbiddenException, NotFoundException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { LoginDto, RegisterDto } from './auth.dto';
import { ConfigService } from '@nestjs/config';
import { writeResponse } from '../common/api-response';
import { Prisma } from '../generated/prisma/client';

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

    return writeResponse(`Bienvenido ${user.name} ${user.lastName}`, {
      access_token: this.signToken(user, active.clinicId),
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        name: user.name,
        lastName: user.lastName,
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
    });
  }

  async register(register: RegisterDto, actorUserId: string, activeClinicId: string) {
    const { email, password, name, lastName, username } = register;
    const existingUser = await this.prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
      select: { email: true, username: true },
    });

    if (existingUser) {
      if (existingUser.email === email) {
        throw new ConflictException('El email ya está registrado');
      }
      throw new ConflictException('El nombre de usuario ya está registrado');
    }

    // El DOCTOR solo puede dar de alta asistentes en un consultorio del que es miembro.
    const clinicId = register.clinicId ?? activeClinicId;
    const hashedPassword = await bcrypt.hash(password, 10);

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const actorMembership = await tx.clinicUser.findFirst({
          where: {
            userId: actorUserId,
            clinicId,
            role: 'DOCTOR',
            isActive: true,
            clinic: { isActive: true },
          },
          select: { clinicId: true },
        });

        if (!actorMembership) {
          throw new ForbiddenException('No tienes permisos en ese consultorio');
        }

        const user = await tx.user.create({
          data: { email, username, password: hashedPassword, name, lastName },
        });

        const membership = await tx.clinicUser.create({
          data: { clinicId, userId: user.id, role: 'ASSISTANT', isActive: true },
          include: { clinic: true },
        });

        return { user, membership };
      });

      return writeResponse(`Usuario ${result.user.name} registrado exitosamente`, {
        access_token: this.signToken(result.user, result.membership.clinicId),
        user: {
          id: result.user.id,
          email: result.user.email,
          username: result.user.username,
          name: result.user.name,
          lastName: result.user.lastName,
          role: result.user.role,
        },
        clinic: {
          id: result.membership.clinicId,
          name: result.membership.clinic.name,
          role: result.membership.role,
        },
        clinics: [{
          id: result.membership.clinicId,
          name: result.membership.clinic.name,
          role: result.membership.role,
        }],
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('El email o el nombre de usuario ya están registrados');
      }
      throw error;
    }
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

    return writeResponse(`Consultorio activo: ${membership.clinic.name}`, {
      access_token: this.signToken(membership.user, membership.clinicId),
      clinic: {
        id: membership.clinicId,
        name: membership.clinic.name,
        role: membership.role,
      },
    });
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
