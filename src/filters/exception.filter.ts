import {
    ArgumentsHost,
    Catch,
    ExceptionFilter,
    HttpException,
    HttpStatus,
    Injectable,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { PinoLoggerService } from '../common/observability/pino-logger.service';
import { MetricsService } from '../common/observability/metrics.service';
import { RequestContextService } from '../common/observability/request-context';

@Catch()
@Injectable()
export class AllExceptionsFilter implements ExceptionFilter {
    constructor(
        private readonly logger: PinoLoggerService,
        private readonly requestContext: RequestContextService,
        private readonly metrics: MetricsService,
    ) {}

    catch(exception: unknown, host: ArgumentsHost): void {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();
        const current = this.requestContext.get();
        const requestId = current?.requestId ?? randomUUID();

        const status = exception instanceof HttpException
            ? exception.getStatus()
            : HttpStatus.INTERNAL_SERVER_ERROR;

        const rawMessage = this.extractMessage(exception);
        const message = status >= 500 ? 'Error interno del servidor' : rawMessage;
        const code = this.codeFor(status, rawMessage);

        if (current && !current.metricsRecorded) {
            const method = current.method ?? request.method;
            const route = 'guard';

            this.metrics.httpRequestsTotal.inc({ method, route, status: String(status) });
            this.metrics.httpErrorsTotal.inc({ method, route, status: String(status) });
            current.metricsRecorded = true;
        }

        const meta = {
            requestId,
            method: current?.method ?? request.method,
            path: current?.path ?? request.originalUrl?.split('?')[0],
            statusCode: status,
            userId: current?.userId,
            clinicId: current?.clinicId,
            errorName: exception instanceof Error ? exception.name : 'UnknownError',
            errorMessage: rawMessage,
        };

        if (status >= 500) {
            this.logger.error('request failed', {
                ...meta,
                stack: exception instanceof Error ? exception.stack : undefined,
            });
        } else {
            this.logger.warn('request failed', meta);
        }

        response.status(status).json({
            status: false,
            message,
            code,
            requestId,
        });
    }

    private extractMessage(exception: unknown): string {
        if (exception instanceof HttpException) {
            const body = exception.getResponse();

            if (typeof body === 'string') {
                return this.cleanMessage(body);
            }

            if (body && typeof body === 'object') {
                const value = (body as { message?: unknown; error?: unknown }).message
                    ?? (body as { error?: unknown }).error;

                if (Array.isArray(value)) {
                    return this.cleanMessage(value.join(', '));
                }

                if (value !== undefined && value !== null) {
                    return this.cleanMessage(String(value));
                }
            }

            return this.cleanMessage(exception.message);
        }

        if (exception instanceof Error) {
            return exception.message;
        }

        return String(exception);
    }

    private cleanMessage(message: string): string {
        return message.replace(/^[A-Za-z]*Exception:\s*/, '');
    }

    private codeFor(status: number, message: string): string {
        if (status === HttpStatus.BAD_REQUEST && message.startsWith('Errores de validación')) {
            return 'VALIDATION_ERROR';
        }

        switch (status) {
            case HttpStatus.BAD_REQUEST:
                return 'BAD_REQUEST';
            case HttpStatus.UNAUTHORIZED:
                return 'UNAUTHORIZED';
            case HttpStatus.FORBIDDEN:
                return 'FORBIDDEN';
            case HttpStatus.NOT_FOUND:
                return 'NOT_FOUND';
            case HttpStatus.CONFLICT:
                return 'CONFLICT';
            case HttpStatus.TOO_MANY_REQUESTS:
                return 'RATE_LIMITED';
            case HttpStatus.BAD_GATEWAY:
                return 'UPSTREAM_ERROR';
            case HttpStatus.SERVICE_UNAVAILABLE:
                return 'SERVICE_UNAVAILABLE';
            default:
                return 'INTERNAL_ERROR';
        }
    }
}
