import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`.
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    // Al retirar Prisma se fue el único `.spec.ts` que había. Sin esto, `pnpm
    // test` sale en rojo por no encontrar archivos, que no es un fallo.
    passWithNoTests: true,
  },
});
