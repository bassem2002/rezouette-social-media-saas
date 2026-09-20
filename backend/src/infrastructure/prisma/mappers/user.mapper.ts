import type { User as PrismaUser } from '../../../../generated/prisma/client.js'
import { User } from '../../../domain/user/entities/user.entity.js'

/// Conversion ligne Prisma ↔ entité de domaine User.
export const UserMapper = {
  toDomain(row: PrismaUser): User {
    return User.reconstitute({
      id: row.id,
      email: row.email,
      passwordHash: row.passwordHash,
      name: row.name,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })
  },

  toPersistence(user: User) {
    return {
      id: user.id,
      email: user.email,
      passwordHash: user.passwordHash,
      name: user.name,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }
  },
}
