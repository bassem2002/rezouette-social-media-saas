/// Agrégat de contenu, neutre vis-à-vis des plateformes.
/// Les médias et les résultats de diffusion par réseau sont des entités
/// séparées (Media, PostPlatformResult) — voir le schéma Prisma.
export type PostStatus =
  | 'draft'
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'partially_published'
  | 'failed'

export interface PostProps {
  id: string
  userId: string
  content: string
  status: PostStatus
  scheduledAt: Date | null
  publishedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export class Post {
  private constructor(private readonly props: PostProps) {}

  static create(input: {
    userId: string
    content: string
    scheduledAt?: Date | null
  }): Post {
    const now = new Date()
    return new Post({
      id: crypto.randomUUID(),
      userId: input.userId,
      content: input.content,
      status: input.scheduledAt ? 'scheduled' : 'draft',
      scheduledAt: input.scheduledAt ?? null,
      publishedAt: null,
      createdAt: now,
      updatedAt: now,
    })
  }

  static reconstitute(props: PostProps): Post {
    return new Post(props)
  }

  schedule(scheduledAt: Date): void {
    if (scheduledAt <= new Date()) {
      throw new Error('Scheduled date must be in the future')
    }
    this.props.scheduledAt = scheduledAt
    this.props.status = 'scheduled'
    this.touch()
  }

  /// Verrou anti double-déclenchement par le scheduler.
  markPublishing(): void {
    this.props.status = 'publishing'
    this.touch()
  }

  markPublished(): void {
    this.props.status = 'published'
    this.props.publishedAt = new Date()
    this.touch()
  }

  /// Au moins une cible a réussi, au moins une a échoué.
  markPartiallyPublished(): void {
    this.props.status = 'partially_published'
    this.props.publishedAt = this.props.publishedAt ?? new Date()
    this.touch()
  }

  markFailed(): void {
    this.props.status = 'failed'
    this.touch()
  }

  private touch(): void {
    this.props.updatedAt = new Date()
  }

  get id(): string {
    return this.props.id
  }
  get userId(): string {
    return this.props.userId
  }
  get content(): string {
    return this.props.content
  }
  get status(): PostStatus {
    return this.props.status
  }
  get scheduledAt(): Date | null {
    return this.props.scheduledAt
  }
  get publishedAt(): Date | null {
    return this.props.publishedAt
  }
  get createdAt(): Date {
    return this.props.createdAt
  }
  get updatedAt(): Date {
    return this.props.updatedAt
  }
}
