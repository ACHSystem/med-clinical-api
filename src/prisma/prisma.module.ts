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
      // Joi valida y convierte los numeros, pero @nestjs/config los vuelve a escribir
      // en process.env como string: sin Number() el pool recibiria "10", no 10.
      useFactory: (config: ConfigService) =>
        new PrismaService({
          connectionString: config.getOrThrow<string>('DATABASE_URL'),
          max: Number(config.get<string>('DATABASE_POOL_MAX') ?? 10),
          connectionTimeoutMillis: Number(
            config.get<string>('DATABASE_POOL_CONNECT_TIMEOUT_MS') ?? 5_000,
          ),
          idleTimeoutMillis: Number(
            config.get<string>('DATABASE_POOL_IDLE_TIMEOUT_MS') ?? 30_000,
          ),
        }),
    },
  ],
  exports: [PrismaService],
})
export class PrismaModule {}
