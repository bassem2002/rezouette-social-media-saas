import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma.service.js'
import { Post } from '../../../domain/post/entities/post.entity.js'
import { PostRepository } from '../../../domain/post/repositories/post.repository.js'
import { PostMapper } from '../mappers/post.mapper.js'

@Injectable()
export class PrismaPostRepository implements PostRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Post | null> {
    const row = await this.prisma.post.findUnique({ where: { id } })
    return row ? PostMapper.toDomain(row) : null
  }

  async findByUserId(userId: string): Promise<Post[]> {
    const rows = await this.prisma.post.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })
    return rows.map((row) => PostMapper.toDomain(row))
  }

  async save(post: Post): Promise<void> {
    const data = PostMapper.toPersistence(post)
    await this.prisma.post.upsert({
      where: { id: post.id },
      create: data,
      update: data,
    })
  }

  async delete(id: string): Promise<void> {
    await this.prisma.post.delete({ where: { id } })
  }
}
