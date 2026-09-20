import { User } from '../entities/user.entity.js'

/// Contrat de persistance des utilisateurs. Implémenté dans l'infrastructure.
export interface UserRepository {
  findById(id: string): Promise<User | null>
  findByEmail(email: string): Promise<User | null>
  save(user: User): Promise<void>
}

/// Token d'injection NestJS — découple l'application de Prisma (DIP).
export const USER_REPOSITORY = Symbol('UserRepository')
