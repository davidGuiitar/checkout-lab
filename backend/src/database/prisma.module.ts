import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/** Módulo global: PrismaService queda disponible en toda la app sin reimportarlo. */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
