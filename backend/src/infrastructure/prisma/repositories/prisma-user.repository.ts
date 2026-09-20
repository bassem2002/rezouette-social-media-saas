import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma.service.js'
import { User } from '../../../domain/user/entities/user.entity.js'
import { UserRepository } from '../../../domain/user/repositories/user.repository.js'
import { UserMapper } from '../mappers/user.mapper.js'

@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { id } })
    return row ? UserMapper.toDomain(row) : null
  }

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { email } })
    return row ? UserMapper.toDomain(row) : null
  }

  async save(user: User): Promise<void> {
    const data = UserMapper.toPersistence(user)
    await this.prisma.user.upsert({
      where: { id: user.id },
      create: data,
      update: data,
    })
  }
}
