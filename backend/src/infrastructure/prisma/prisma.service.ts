import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../../generated/prisma/client.js'

/// Client Prisma géré par NestJS. Prisma 7 (générateur `prisma-client`)
/// exige un driver adapter — ici PostgreSQL via `@prisma/adapter-pg`.
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name)

  constructor() {
    const connectionString = process.env['DATABASE_URL']
    if (!connectionString) {
      throw new Error('DATABASE_URL is not defined')
    }
    super({ adapter: new PrismaPg({ connectionString }) })
  }

  async onModuleInit(): Promise<void> {
    await this.$connect()
    this.logger.log('Prisma connected')
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect()
  }
}
