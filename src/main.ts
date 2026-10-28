import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { PinoLoggerService } from './common/observability/pino-logger.service';
import { requestContextMiddleware } from './common/observability/request-context';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.use(requestContextMiddleware);
  app.useLogger(app.get(PinoLoggerService));

  // El body lo limita el parser de Nest a 100kb por defecto
  app.use(helmet());
  // IP real del cliente detras de un balanceador/proxy (necesario para throttling por IP)
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  const corsOrigins = config
    .getOrThrow<string>('CORS_ORIGINS')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    maxAge: 600,
  });

  // AuthGuard, RolesGuard y ThrottlerGuard se registran como APP_GUARD en AppModule.
  // AllExceptionsFilter se registra por DI en ObservabilityModule.
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) => {
      const message = errors
        .map(
          (error) =>
            `${Object.values(error.constraints ?? {}).join(', ')}`
        )
        .join('; ');

      return new BadRequestException(`Errores de validación: ${message}`);
    },
  }));
  // Cierra Prisma y los sockets de forma ordenada en despliegues rolling
  app.enableShutdownHooks();
  app.setGlobalPrefix('/api');
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
