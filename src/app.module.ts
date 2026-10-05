import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { envsSchema } from './core/config/envs.js';
import { PrismaModule } from './core/database/prisma/prisma.module.js';
import { ApiExceptionFilter } from './core/filters/api-exception.filter.js';
import { AccessGuard } from './core/guards/access.guard.js';
import { RolesGuard } from './core/guards/roles.guard.js';
import { CoreModule } from './modules/core/core.module.js';
import { CustomerModule } from './modules/customer/customer.module.js';
import { InventoryModule } from './modules/inventory/inventory.module.js';
import { WorkshopModule } from './modules/workshop/workshop.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envsSchema,
    }),
    PrismaModule,
    // Un módulo por grupo de dominio (src/modules/<group>/); cada grupo importa
    // sus propios módulos.
    CoreModule,
    CustomerModule,
    WorkshopModule,
    InventoryModule,
  ],
  controllers: [AppController],
  providers: [
    // Todo endpoint exige sesión salvo los marcados con @Public(), y los que
    // declaran @Roles() exigen además uno de esos roles. El orden importa: el
    // de roles lee el usuario que deja el de acceso.
    { provide: APP_GUARD, useClass: AccessGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    // Todo error sale con el formato de BaseResponseDto.
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule {}
