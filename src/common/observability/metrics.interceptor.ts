import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { MetricsService } from './metrics.service';
import { RequestContextService } from './request-context';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(
    private readonly metrics: MetricsService,
    private readonly requestContext: RequestContextService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();

    if (request.path === '/api/metrics') {
      return next.handle();
    }

    const method = request.method;
    const route = context.getHandler()?.name ?? 'unmatched';
    const stopTimer = this.metrics.httpRequestDuration.startTimer({ method, route });

    return next.handle().pipe(
      tap(() => {
        const status = String(http.getResponse<Response>().statusCode);
        stopTimer();
        this.metrics.httpRequestsTotal.inc({ method, route, status });
        this.markRecorded();
      }),
      catchError((error: unknown) => {
        const status = String(error instanceof HttpException ? error.getStatus() : 500);
        stopTimer();
        this.metrics.httpRequestsTotal.inc({ method, route, status });
        this.metrics.httpErrorsTotal.inc({ method, route, status });
        this.markRecorded();
        return throwError(() => error);
      }),
    );
  }

  private markRecorded(): void {
    const context = this.requestContext.get();

    if (context) {
      context.metricsRecorded = true;
    }
  }
}
