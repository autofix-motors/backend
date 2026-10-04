import type { ExecutionContext } from '@nestjs/common';

// Un ExecutionContext mínimo para probar guards sin levantar Nest: una petición
// y los dos objetivos donde el Reflector busca los metadatos (método y clase).
export function testContext(
  request: Record<string, unknown>,
): ExecutionContext {
  const handler = () => undefined;
  class TestController {}
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => TestController,
  } as unknown as ExecutionContext;
}
