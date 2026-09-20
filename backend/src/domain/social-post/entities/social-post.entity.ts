/// Publication unitaire archivée : une ligne d'historique par envoi vers une
/// plateforme. Entité de trace autonome (distincte de l'agrégat Post), alimentée
/// par les use-cases de publication.

/// Réseaux réellement publiables : Meta (FB/IG) + TikTok + LinkedIn (profil
/// membre) + YouTube (Data API v3).
export type SocialPostPlatform =
  | 'facebook'
  | 'instagram'
  | 'tiktok'
  | 'linkedin'
  | 'youtube'

/// Cycle de vie d'une publication : PENDING avant l'appel Meta, puis terminal.
export type SocialPostStatus = 'pending' | 'published' | 'failed'

/// Détail d'échec Meta normalisé, attaché à une publication FAILED.
export interface SocialPostFailure {
  code: number
  subcode?: number
  reason: string
  retryable: boolean
}

export interface SocialPostProps {
  id: string
  userId: string
  platform: SocialPostPlatform
  accountId: string | null
  externalPostId: string | null
  /// ID de tâche de publication asynchrone (TikTok `publish_id`), si applicable.
  publishId: string | null
  caption: string | null
  mediaUrl: string | null
  status: SocialPostStatus
  errorMessage: string | null
  metaCode: number | null
  metaSubcode: number | null
  metaReason: string | null
  retryable: boolean | null
  publishedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export class SocialPost {
  private constructor(private readonly props: SocialPostProps) {}

  /// Crée une publication à l'état PENDING, juste avant l'appel à Meta.
  static createPending(input: {
    userId: string
    platform: SocialPostPlatform
    accountId?: string | null
    caption?: string | null
    mediaUrl?: string | null
  }): SocialPost {
    const now = new Date()
    return new SocialPost({
      id: crypto.randomUUID(),
      userId: input.userId,
      platform: input.platform,
      accountId: input.accountId ?? null,
      externalPostId: null,
      publishId: null,
      caption: input.caption ?? null,
      mediaUrl: input.mediaUrl ?? null,
      status: 'pending',
      errorMessage: null,
      metaCode: null,
      metaSubcode: null,
      metaReason: null,
      retryable: null,
      publishedAt: null,
      createdAt: now,
      updatedAt: now,
    })
  }

  static reconstitute(props: SocialPostProps): SocialPost {
    return new SocialPost(props)
  }

  /// Rattache l'ID de tâche de publication asynchrone (TikTok `publish_id`),
  /// obtenu à l'initialisation de la publication, avant l'état terminal.
  attachPublishId(publishId: string): void {
    this.props.publishId = publishId
    this.touch()
  }

  /// Transition vers le succès : on fige l'ID Meta et la date de publication.
  markPublished(externalPostId: string): void {
    this.props.status = 'published'
    this.props.externalPostId = externalPostId
    this.props.errorMessage = null
    this.props.publishedAt = new Date()
    this.touch()
  }

  /// Transition vers l'échec : message lisible + détail Meta normalisé
  /// (code/subcode/reason/retryable) issu de MetaExceptionMapper.
  markFailed(errorMessage: string, failure?: SocialPostFailure): void {
    this.props.status = 'failed'
    this.props.errorMessage = errorMessage
    this.props.metaCode = failure?.code ?? null
    this.props.metaSubcode = failure?.subcode ?? null
    this.props.metaReason = failure?.reason ?? null
    this.props.retryable = failure?.retryable ?? null
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
  get platform(): SocialPostPlatform {
    return this.props.platform
  }
  get accountId(): string | null {
    return this.props.accountId
  }
  get externalPostId(): string | null {
    return this.props.externalPostId
  }
  get publishId(): string | null {
    return this.props.publishId
  }
  get caption(): string | null {
    return this.props.caption
  }
  get mediaUrl(): string | null {
    return this.props.mediaUrl
  }
  get status(): SocialPostStatus {
    return this.props.status
  }
  get errorMessage(): string | null {
    return this.props.errorMessage
  }
  get metaCode(): number | null {
    return this.props.metaCode
  }
  get metaSubcode(): number | null {
    return this.props.metaSubcode
  }
  get metaReason(): string | null {
    return this.props.metaReason
  }
  get retryable(): boolean | null {
    return this.props.retryable
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
