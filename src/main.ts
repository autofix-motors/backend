import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { ACCESS_COOKIE } from './core/auth/cookies.js';
import { createValidationPipe } from './core/validation/validation.pipe.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const port = config.get<number>('PORT') ?? 3000;

  // Las sesiones viajan en cookies: sin esto, `request.cookies` no existe.
  // cookie-parser es CommonJS: va con import default, no con `import * as`.
  app.use(cookieParser());

  app.useGlobalPipes(createValidationPipe());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('AutoFix Motors - API')
    .setDescription('API para AutoFix Motors')
    .setVersion('1.0')
    // La sesión va en una cookie httpOnly que pone POST /auth/login: desde esta
    // misma página, se ejecuta el login y el navegador la manda sola en las
    // siguientes llamadas. No hay token que copiar ni pegar.
    .addCookieAuth(
      ACCESS_COOKIE,
      {
        type: 'apiKey',
        in: 'cookie',
        name: ACCESS_COOKIE,
        description: 'Se obtiene ejecutando POST /auth/login en esta página',
      },
      ACCESS_COOKIE,
    )
    .addSecurityRequirements(ACCESS_COOKIE)
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      // Barra de búsqueda para filtrar endpoints por tag.
      filter: true,
      displayRequestDuration: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  await app.listen(port);

  const logger = new Logger('AutoFix-Motors-Backend');
  logger.log(`API corriendo en http://localhost:${port}`);
}

await bootstrap();
