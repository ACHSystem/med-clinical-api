import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { PinoLoggerService } from './pino-logger.service';
import { RequestContextService } from './request-context';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(
    private readonly logger: PinoLoggerService,
    private readonly requestContext: RequestContextService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();

    if (request.path === '/api/metrics') {
      return next.handle();
    }

    const startedAt = Date.now();

    return next.handle().pipe(
      tap(() => {
        const response = http.getResponse<Response>();
        const current = this.requestContext.get();

        this.logger.log('request completed', {
          requestId: current?.requestId,
          method: request.method,
          path: request.originalUrl?.split('?')[0],
          statusCode: response.statusCode,
          durationMs: Date.now() - startedAt,
          userId: current?.userId,
          clinicId: current?.clinicId,
        });
      }),
    );
  }
}
