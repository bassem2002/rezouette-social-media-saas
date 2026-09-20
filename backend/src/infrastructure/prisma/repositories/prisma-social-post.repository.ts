import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma.service.js'
import { SocialPost } from '../../../domain/social-post/entities/social-post.entity.js'
import type { SocialPostPlatform } from '../../../domain/social-post/entities/social-post.entity.js'
import { SocialPostRepository } from '../../../domain/social-post/repositories/social-post.repository.js'
import { SocialPostMapper, toDbSocialPostPlatform } from '../mappers/social-post.mapper.js'

@Injectable()
export class PrismaSocialPostRepository implements SocialPostRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(post: SocialPost): Promise<void> {
    const data = SocialPostMapper.toPersistence(post)
    await this.prisma.socialPost.upsert({
      where: { id: post.id },
      create: data,
      update: data,
    })
  }

  async findAll(): Promise<SocialPost[]> {
    const rows = await this.prisma.socialPost.findMany({
      orderBy: { createdAt: 'desc' },
    })
    return rows.map((row) => SocialPostMapper.toDomain(row))
  }

  async findById(id: string): Promise<SocialPost | null> {
    const row = await this.prisma.socialPost.findUnique({ where: { id } })
    return row ? SocialPostMapper.toDomain(row) : null
  }

  async findByUserId(userId: string): Promise<SocialPost[]> {
    const rows = await this.prisma.socialPost.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })
    return rows.map((row) => SocialPostMapper.toDomain(row))
  }

  /// Utilise l'index existant `(platform, status)` — aucune migration requise.
  /// Ordre ascendant : les publications les plus anciennes sont réconciliées en
  /// premier, ce sont elles qui approchent de la limite d'âge.
  async findPendingByPlatform(
    platform: SocialPostPlatform,
    limit: number,
  ): Promise<SocialPost[]> {
    const rows = await this.prisma.socialPost.findMany({
      where: { platform: toDbSocialPostPlatform(platform), status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: Math.max(1, Math.trunc(limit)),
    })
    return rows.map((row) => SocialPostMapper.toDomain(row))
  }
}
