import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

export interface ITokenPayload {
    sub: string;
    email: string;
    role: string;
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
    ) { }

    canActivate(context: ExecutionContext): boolean {
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

        // CurrentUserData expone la id como `userId`, pero el payload usa `sub`
        request['user'] = {
            userId: payload.sub,
            email: payload.email,
            role: payload.role,
        };
        return true;
    }
}
