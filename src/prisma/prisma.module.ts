import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from './prisma.service';

/**
 * Un unico PrismaClient (y por tanto un unico pool) para toda la aplicacion.
 * Antes cada modulo de feature registraba el suyo: 9 pools en un solo proceso.
 */
@Global()
@Module({
  providers: [
    {
      provide: PrismaService,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new PrismaService({
          connectionString: config.getOrThrow<string>('DATABASE_URL'),
          max: config.get<number>('DATABASE_POOL_MAX') ?? 10,
          connectionTimeoutMillis: config.get<number>('DATABASE_POOL_CONNECT_TIMEOUT_MS') ?? 5_000,
          idleTimeoutMillis: config.get<number>('DATABASE_POOL_IDLE_TIMEOUT_MS') ?? 30_000,
        }),
    },
  ],
  exports: [PrismaService],
})
export class PrismaModule {}
