import { Injectable, LoggerService } from '@nestjs/common';
import pino, { Logger } from 'pino';

type Level = 'info' | 'warn' | 'error' | 'debug' | 'trace' | 'fatal';

@Injectable()
export class PinoLoggerService implements LoggerService {
  private readonly logger: Logger;

  constructor() {
    this.logger = pino({
      level: process.env.LOG_LEVEL ?? 'info',
      base: { service: 'med-clinical-api' },
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: {
        paths: [
          'password',
          'token',
          'access_token',
          'authorization',
          'req.headers.authorization',
          'req.headers.cookie',
        ],
        censor: '[REDACTED]',
      },
    });
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.write('info', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write('warn', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.write('error', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write('debug', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write('trace', message, optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.write('fatal', message, optionalParams);
  }

  private write(level: Level, message: unknown, optionalParams: unknown[]): void {
    const meta: Record<string, unknown> = {};

    for (const param of optionalParams) {
      if (typeof param === 'string') {
        meta.context = param;
      } else if (param && typeof param === 'object') {
        Object.assign(meta, param);
      }
    }

    if (message instanceof Error) {
      this.logger[level]({ ...meta, err: message }, message.message);
      return;
    }

    if (message && typeof message === 'object') {
      this.logger[level]({ ...meta, ...(message as Record<string, unknown>) });
      return;
    }

    this.logger[level](meta, String(message));
  }
}
