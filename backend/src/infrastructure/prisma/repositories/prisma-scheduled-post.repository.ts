import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma.service.js'
import { ScheduledPost } from '../../../domain/scheduled-post/entities/scheduled-post.entity.js'
import { ScheduledPostRepository } from '../../../domain/scheduled-post/repositories/scheduled-post.repository.js'
import { ScheduledPostMapper } from '../mappers/scheduled-post.mapper.js'

@Injectable()
export class PrismaScheduledPostRepository implements ScheduledPostRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(post: ScheduledPost): Promise<void> {
    const data = ScheduledPostMapper.toPersistence(post)
    await this.prisma.scheduledPost.upsert({
      where: { id: post.id },
      create: data,
      update: data,
    })
  }

  async findById(id: string): Promise<ScheduledPost | null> {
    const row = await this.prisma.scheduledPost.findUnique({ where: { id } })
    return row ? ScheduledPostMapper.toDomain(row) : null
  }

  async findAll(): Promise<ScheduledPost[]> {
    const rows = await this.prisma.scheduledPost.findMany({
      orderBy: { scheduledAt: 'asc' },
    })
    return rows.map((row) => ScheduledPostMapper.toDomain(row))
  }

  async findByUserId(userId: string): Promise<ScheduledPost[]> {
    const rows = await this.prisma.scheduledPost.findMany({
      where: { userId },
      orderBy: { scheduledAt: 'asc' },
    })
    return rows.map((row) => ScheduledPostMapper.toDomain(row))
  }

  async findDue(now: Date, limit: number): Promise<ScheduledPost[]> {
    const rows = await this.prisma.scheduledPost.findMany({
      where: { status: 'SCHEDULED', scheduledAt: { lte: now } },
      orderBy: { scheduledAt: 'asc' },
      take: limit,
    })
    return rows.map((row) => ScheduledPostMapper.toDomain(row))
  }
}
