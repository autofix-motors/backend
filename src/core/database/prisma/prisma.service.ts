import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client.js';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(config: ConfigService) {
    super({
      // Prisma 7 no permite instanciar el cliente sin un driver adapter. El
      // pool de conexiones lo maneja `pg`, no Prisma: sus parámetros van aquí.
      adapter: new PrismaPg({
        connectionString: config.getOrThrow<string>('DATABASE_URL'),
      }),
    });
  }

  async onModuleInit() {
    await this.$connect();

    // `$connect()` con driver adapter es perezoso: no abre conexión ni valida
    // credenciales, así que con una URL equivocada la aplicación arranca feliz
    // y recién revienta en el primer request. Esta consulta trivial fuerza una
    // conexión real para que el error salga al desplegar, que es cuando
    // alguien lo está mirando.
    await this.$queryRaw`SELECT 1`;
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
