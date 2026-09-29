import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

export interface PrismaPoolOptions {
  connectionString: string;
  /** Conexiones maximas del pool. Multiplicar por el numero de procesos antes de subirlo. */
  max?: number;
  connectionTimeoutMillis?: number;
  idleTimeoutMillis?: number;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(options: PrismaPoolOptions) {
    super({
      adapter: new PrismaPg({
        connectionString: options.connectionString,
        max: options.max ?? 10,
        connectionTimeoutMillis: options.connectionTimeoutMillis ?? 5_000,
        idleTimeoutMillis: options.idleTimeoutMillis ?? 30_000,
      }),
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  /** Sin esto cada despliegue deja los pools abiertos hasta que Postgres los mata por timeout. */
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
