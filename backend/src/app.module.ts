import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './database/prisma.module';
import { CheckoutModule } from './checkout/checkout.module';
import { ProductsModule } from './products/products.module';

/**
 * Módulo raíz: carga variables de entorno, la base de datos, los módulos de
 * negocio y un límite global de peticiones por IP.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }), // Carga variables de entorno
    PrismaModule, // Base de datos - conecxión a PostgreSQL
    ProductsModule, // Módulo de productos - catalogo
    CheckoutModule, // Pagos y transacciones
    // Máximo 100 peticiones por minuto por cliente.
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 100,
      },
    ]),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Aplica el limitador de peticiones a todas las rutas.
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
