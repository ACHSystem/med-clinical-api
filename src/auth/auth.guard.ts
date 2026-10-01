import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

export interface ITokenPayload {
    sub: string;
    email: string;
    username: string;
    role: string;
    /** Consultorio activo: el tenant de la peticion. */
    clinicId: string;
    iat: number;
    exp: number;
}

const routesIgnores = [
    '/api/auth/login',
];

@Injectable()
export class AuthGuard implements CanActivate {

    constructor(
        private jwtService: JwtService,
        private configService: ConfigService,
        private readonly prisma: PrismaService,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request: Request = context.switchToHttp().getRequest();
        const requestPath = request.url.split('?')[0];

        if (
            routesIgnores.includes(requestPath)
        ) {
            return true;
        }

        const authHeader = request.headers['authorization'];
        if (!authHeader) throw new UnauthorizedException('Token no enviado');

        const [type, token] = authHeader.split(' ');
        if (type !== 'Bearer' || !token) {
            throw new UnauthorizedException('Token no enviado');
        }

        let payload: ITokenPayload;
        try {
            // Se verifica la firma: decode() solo lee el payload y aceptaba cualquier token
            payload = this.jwtService.verify(token, {
                secret: this.configService.getOrThrow<string>('JWT_SECRET'),
                algorithms: ['HS256'],
            });
        } catch (err) {
            throw new UnauthorizedException('Token inválido o expirado');
        }

        if (!payload.sub) {
            throw new UnauthorizedException('Token inválido o expirado');
        }

        // Sin consultorio no hay tenant: son tokens emitidos antes del modelo multi-clinica
        if (!payload.clinicId) {
            throw new UnauthorizedException('Token sin consultorio: inicia sesión de nuevo');
        }

        // La membresía se revisa en cada peticion (no solo en el login) para que
        // expulsar a alguien del consultorio surta efecto de inmediato y no
        // espere a que expire el token de 7 dias.
        const membership = await this.prisma.clinicUser.findFirst({
            where: {
                clinicId: payload.clinicId,
                userId: payload.sub,
                isActive: true,
                clinic: { isActive: true },
            },
            select: { role: true },
        });

        if (!membership) {
            throw new UnauthorizedException('No tienes acceso a este consultorio');
        }

        // CurrentUserData expone la id como `userId`, pero el payload usa `sub`
        request['user'] = {
            userId: payload.sub,
            email: payload.email,
            username: payload.username,
            // El rol es el de la membresia, no el de la cuenta: el mismo usuario
            // puede ser DOCTOR en un consultorio y ASSISTANT en otro.
            role: membership.role,
            clinicId: payload.clinicId,
        };
        return true;
    }
}
