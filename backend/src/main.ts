import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

/**
 * Punto de entrada del backend: crea la aplicación Nest, aplica la
 * configuración global (seguridad, validación, Swagger) y la expone en PORT.
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);

  await app.listen(Number(process.env.PORT ?? 3000));
}
void bootstrap();
