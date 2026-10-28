import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AllExceptionsFilter } from '../../filters/exception.filter';
import { LoggingInterceptor } from './logging.interceptor';
import { MetricsController } from './metrics.controller';
import { MetricsInterceptor } from './metrics.interceptor';
import { MetricsService } from './metrics.service';
import { MetricsTokenGuard } from './metrics-token.guard';
import { PinoLoggerService } from './pino-logger.service';
import { RequestContextService } from './request-context';

@Global()
@Module({
  controllers: [MetricsController],
  providers: [
    RequestContextService,
    PinoLoggerService,
    MetricsService,
    MetricsTokenGuard,
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
  exports: [RequestContextService, PinoLoggerService, MetricsService],
})
export class ObservabilityModule {}
