import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ProvidersModule } from './providers/providers.module';
import { PatientsModule } from './patients/patients.module';
import { CustomizeModule } from './customize/customize.module';
import { MedicalHistoriesModule } from './medical-histories/medical-histories.module';
import { ServicesCostsModule } from './services-costs/services-costs.module';
import { QuotesModule } from './quotes/quotes.module';
import { PaymentModule } from './payment/payment.module';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth/auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { ObservabilityModule } from './common/observability/observability.module';
import { AuditModule } from './audit/audit.module';
import * as Joi from 'joi';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'], // primero busca en .env.local
      validationSchema: Joi.object({
        DATABASE_URL: Joi.string().uri({ scheme: ['postgresql', 'postgres'] }).required(),
        JWT_SECRET: Joi.string().min(32).required(),
        PORT: Joi.number().port().default(3000),
        CORS_ORIGINS: Joi.string().required(),
        DATABASE_POOL_MAX: Joi.number().integer().min(1).max(100).default(10),
        DATABASE_POOL_CONNECT_TIMEOUT_MS: Joi.number().integer().min(1000).default(5000),
        DATABASE_POOL_IDLE_TIMEOUT_MS: Joi.number().integer().min(1000).default(30000),
        NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
        LOG_LEVEL: Joi.string().valid('trace', 'debug', 'info', 'warn', 'error', 'fatal').default('info'),
        METRICS_TOKEN: Joi.string().min(16).allow('').optional(),
      }),
    }),
    // Un unico limitador global; las rutas criticas lo sobrescriben con @Throttle.
    // Varios limitadores con nombre se aplicarian a TODAS las rutas, no solo a las decoradas.
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 60_000, limit: 100 },
    ]),
    PrismaModule,
    ObservabilityModule,
    AuditModule,
    AuthModule,
    ProvidersModule,
    PatientsModule,
    CustomizeModule,
    MedicalHistoriesModule,
    ServicesCostsModule,
    QuotesModule,
    PaymentModule
  ],
  controllers: [AppController],
  providers: [
    AppService,
    JwtService,
    // El orden importa: primero limita el trafico, despues valida la sesion y el rol
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule { }
