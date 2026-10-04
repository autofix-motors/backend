import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// La CLI de Prisma no levanta la aplicación de Nest, así que lee el .env por su
// cuenta. La validación con joi de src/core/config/ protege el arranque de la
// API; este archivo protege los comandos de migración. Son dos caminos
// distintos hacia la misma variable y los dos tienen que existir.
export default defineConfig({
  // Apunta al DIRECTORIO, no al archivo. Con una ruta a schema.prisma, Prisma 7
  // ignora en silencio los demás .prisma y las migraciones salen incompletas.
  schema: 'prisma',
  migrations: {
    // Explícito a propósito: con schema multi-archivo, sin esto las migraciones
    // caen dentro de la propia carpeta del schema.
    path: 'prisma/migrations',
    seed: 'tsx prisma/seeds/index.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
