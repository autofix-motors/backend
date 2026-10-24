import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { seedCore } from './core.seed.js';
import { seedInventory } from './inventory.seed.js';
import { seedWorkshop } from './workshop.seed.js';

// Orquesta los seeds y define su orden. Cada módulo pone el suyo en un archivo
// aparte (<grupo>.seed.ts) y se llama desde aquí. El orden importa: el
// inventario registra su compra inicial a nombre del administrador de core.
//
// Los seeds son idempotentes: se usa `upsert`, no `create`. Un seed que falla
// la segunda vez que lo corres es un seed que nadie va a correr.
//
// Siembran solo lo que la aplicación necesita para arrancar -el primer
// administrador y los catálogos base del taller (servicios, repuestos con su
// stock inicial, herramientas)-, no datos de prueba: ni clientes, ni
// vehículos, ni órdenes. Los datos de prueba son de los tests.

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  await seedCore(prisma);
  await seedWorkshop(prisma);
  await seedInventory(prisma);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
