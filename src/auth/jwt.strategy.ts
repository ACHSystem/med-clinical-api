import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { ITokenPayload } from './auth.guard';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(configService: ConfigService) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            // Sin fallback: un secreto por defecto en el codigo seria una credencial publica
            secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
        });
    }

    async validate(payload: ITokenPayload) {
        if (!payload.sub) {
            throw new UnauthorizedException('Token inválido');
        }
        return { userId: payload.sub, email: payload.email, username: payload.username, role: payload.role };
    }
}
