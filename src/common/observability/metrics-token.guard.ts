import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class MetricsTokenGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.configService.get<string>('METRICS_TOKEN');

    if (!expected) {
      throw new NotFoundException('Métricas deshabilitadas');
    }

    const provided = context.switchToHttp().getRequest<Request>().header('x-metrics-token');

    if (provided !== expected) {
      throw new UnauthorizedException('Token de métricas inválido');
    }

    return true;
  }
}
