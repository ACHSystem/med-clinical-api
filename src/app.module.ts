import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';
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
import { AuthGuard } from './auth/auth.guard';
import { APP_GUARD } from '@nestjs/core';

@Module({
  imports: [
    AuthModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'], // primero busca en .env.local
    }),
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
    PrismaService,
    JwtService,
    {
      provide: APP_GUARD,
      useClass: AuthGuard, // se ejecuta primero
    },
  ],
})
export class AppModule { }