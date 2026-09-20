/// Entité de domaine User — aucune dépendance à Prisma ou à NestJS.
export interface UserProps {
  id: string
  email: string
  passwordHash: string
  name: string | null
  createdAt: Date
  updatedAt: Date
}

export class User {
  private constructor(private readonly props: UserProps) {}

  /// Création d'un nouvel utilisateur (le hash est calculé dans la couche application).
  static create(input: {
    email: string
    passwordHash: string
    name?: string | null
  }): User {
    const now = new Date()
    return new User({
      id: crypto.randomUUID(),
      email: input.email,
      passwordHash: input.passwordHash,
      name: input.name ?? null,
      createdAt: now,
      updatedAt: now,
    })
  }

  /// Reconstruction depuis la persistance (utilisée par les mappers infra).
  static reconstitute(props: UserProps): User {
    return new User(props)
  }

  rename(name: string | null): void {
    this.props.name = name
    this.props.updatedAt = new Date()
  }

  get id(): string {
    return this.props.id
  }
  get email(): string {
    return this.props.email
  }
  get passwordHash(): string {
    return this.props.passwordHash
  }
  get name(): string | null {
    return this.props.name
  }
  get createdAt(): Date {
    return this.props.createdAt
  }
  get updatedAt(): Date {
    return this.props.updatedAt
  }
}
