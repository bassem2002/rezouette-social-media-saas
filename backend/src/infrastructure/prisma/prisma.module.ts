import { Global, Module } from '@nestjs/common'
import { PrismaService } from './prisma.service.js'

/// Le client Prisma est partagé globalement : un seul pool de connexions.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
