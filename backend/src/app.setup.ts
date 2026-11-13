import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

/**
 * Configuración global compartida por main.ts y las pruebas e2e, para que
 * ambos entornos se comporten igual.
 */
export function configureApp(app: INestApplication): void {
  // Prefijo opcional (p. ej. "api"); se eliminan las barras al inicio/fin.
  const apiPrefix = process.env.API_PREFIX?.replace(/^\/|\/$/g, '');
  if (apiPrefix) app.setGlobalPrefix(apiPrefix);

  // Cabeceras HTTP de seguridad.
  app.use(helmet());
  // Solo el frontend configurado puede consumir la API desde el navegador.
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    methods: ['GET', 'HEAD', 'POST', 'OPTIONS'],
  });
  // Validación de DTOs: descarta/rechaza campos no declarados y convierte
  // los tipos (p. ej. strings a números) según las clases DTO.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Documentación OpenAPI disponible en /docs (o /<prefijo>/docs).
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Checkout Lab API')
    .setDescription('API para el flujo de checkout')
    .setVersion('1.0')
    .build();
  SwaggerModule.setup(
    apiPrefix ? `${apiPrefix}/docs` : 'docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );
}
