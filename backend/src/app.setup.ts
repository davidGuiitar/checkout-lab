import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

export function configureApp(app: INestApplication): void {
  const apiPrefix = process.env.API_PREFIX?.replace(/^\/|\/$/g, '');
  if (apiPrefix) app.setGlobalPrefix(apiPrefix);

  app.use(helmet());
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    methods: ['GET', 'HEAD', 'POST', 'OPTIONS'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

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
