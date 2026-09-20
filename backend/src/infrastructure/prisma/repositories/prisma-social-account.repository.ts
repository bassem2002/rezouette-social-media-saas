import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma.service.js'
import { SocialAccount } from '../../../domain/social-account/entities/social-account.entity.js'
import { SocialAccountRepository } from '../../../domain/social-account/repositories/social-account.repository.js'
import { SocialPlatform } from '../../../domain/shared/ports/social-provider.port.js'
import {
  SocialAccountMapper,
  toDbPlatform,
} from '../mappers/social-account.mapper.js'

@Injectable()
export class PrismaSocialAccountRepository implements SocialAccountRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<SocialAccount | null> {
    const row = await this.prisma.socialAccount.findUnique({ where: { id } })
    return row ? SocialAccountMapper.toDomain(row) : null
  }

  async findByUserId(userId: string): Promise<SocialAccount[]> {
    const rows = await this.prisma.socialAccount.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    })
    return rows.map((row) => SocialAccountMapper.toDomain(row))
  }

  async findByExternalAccount(
    userId: string,
    platform: SocialPlatform,
    externalAccountId: string,
  ): Promise<SocialAccount | null> {
    const row = await this.prisma.socialAccount.findUnique({
      where: {
        userId_platform_externalAccountId: {
          userId,
          platform: toDbPlatform(platform),
          externalAccountId,
        },
      },
    })
    return row ? SocialAccountMapper.toDomain(row) : null
  }

  async save(account: SocialAccount): Promise<void> {
    const data = SocialAccountMapper.toPersistence(account)
    await this.prisma.socialAccount.upsert({
      where: { id: account.id },
      create: data,
      update: data,
    })
  }
}
