/// Publication programmée : intention de diffusion mémorisée pour un envoi
/// différé. Agrégat autonome de la planification, distinct de l'historique
/// SocialPost (qui trace chaque envoi unitaire au moment de la publication).

import type { SocialPostPlatform } from '../../social-post/entities/social-post.entity.js'
import {
  cloneScheduledPlatformOptions,
  isEmptyScheduledPlatformOptions,
  type ScheduledPlatformOptions,
} from '../value-objects/scheduled-platform-options.js'

/// Réseaux ciblables par une publication programmée (réutilise le type FB/IG
/// de l'historique — aucune duplication d'énumération).
export type ScheduledPostPlatform = SocialPostPlatform

/// Cycle de vie d'une publication programmée :
/// SCHEDULED (en attente) → PROCESSING (envoi en cours) → PUBLISHED | FAILED ;
/// CANCELLED si annulée avant son échéance.
export type ScheduledPostStatus =
  | 'scheduled'
  | 'processing'
  | 'published'
  | 'failed'
  | 'cancelled'

export interface ScheduledPostProps {
  id: string
  userId: string
  platforms: ScheduledPostPlatform[]
  message: string | null
  caption: string | null
  imageUrl: string | null
  /// URL publique de la vidéo (planification TikTok).
  videoUrl: string | null
  /// Options spécifiques à une plateforme (ex. métadonnées YouTube). `null`
  /// quand aucune option n'est fournie — cas de toutes les planifications
  /// antérieures à l'introduction du champ.
  platformOptions: ScheduledPlatformOptions | null
  scheduledAt: Date
  status: ScheduledPostStatus
  attempts: number
  lastError: string | null
  processedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

/// Erreur levée lors d'une transition d'état interdite (invariant métier).
export class ScheduledPostStateError extends Error {}

/// Normalise les options d'entrée : copie défensive, et `{}` ramené à `null`
/// (ne rien persister plutôt qu'un JSON vide). Aucune validation métier ici :
/// les invariants par réseau relèvent des use cases de planification.
function normalizePlatformOptions(
  options: ScheduledPlatformOptions | null | undefined,
): ScheduledPlatformOptions | null {
  if (!options || isEmptyScheduledPlatformOptions(options)) return null
  return cloneScheduledPlatformOptions(options)
}

export class ScheduledPost {
  private constructor(private readonly props: ScheduledPostProps) {}

  /// Crée une publication à l'état SCHEDULED. La validation des entrées
  /// (plateformes non vides, date future, image requise pour Instagram, vidéo
  /// requise pour TikTok) est assurée en amont par le use case.
  static schedule(input: {
    userId: string
    platforms: ScheduledPostPlatform[]
    scheduledAt: Date
    message?: string | null
    caption?: string | null
    imageUrl?: string | null
    videoUrl?: string | null
    platformOptions?: ScheduledPlatformOptions | null
  }): ScheduledPost {
    const now = new Date()
    return new ScheduledPost({
      id: crypto.randomUUID(),
      userId: input.userId,
      platforms: [...input.platforms],
      message: input.message ?? null,
      caption: input.caption ?? null,
      imageUrl: input.imageUrl ?? null,
      videoUrl: input.videoUrl ?? null,
      // Copie défensive à l'entrée : l'appelant ne doit pas pouvoir muter l'état
      // interne après création. Un objet vide est normalisé en `null`.
      platformOptions: normalizePlatformOptions(input.platformOptions),
      scheduledAt: input.scheduledAt,
      status: 'scheduled',
      attempts: 0,
      lastError: null,
      processedAt: null,
      createdAt: now,
      updatedAt: now,
    })
  }

  static reconstitute(props: ScheduledPostProps): ScheduledPost {
    return new ScheduledPost(props)
  }

  /// Vrai si la publication est due (échéance atteinte) et encore éligible à
  /// l'envoi (état SCHEDULED).
  isDue(now: Date = new Date()): boolean {
    return this.props.status === 'scheduled' && this.props.scheduledAt <= now
  }

  /// Transition SCHEDULED → PROCESSING juste avant de déclencher l'envoi.
  /// Incrémente le compteur de tentatives. Idempotence garantie par l'appelant
  /// (réservation atomique en base).
  markProcessing(): void {
    if (this.props.status !== 'scheduled') {
      throw new ScheduledPostStateError(
        `Transition invalide : ${this.props.status} → processing`,
      )
    }
    this.props.status = 'processing'
    this.props.attempts += 1
    this.touch()
  }

  /// Transition PROCESSING → PUBLISHED (toutes les plateformes ont réussi).
  markPublished(): void {
    this.props.status = 'published'
    this.props.lastError = null
    this.props.processedAt = new Date()
    this.touch()
  }

  /// Transition PROCESSING → FAILED (au moins une plateforme a échoué, ou
  /// erreur de précondition). Conserve le message agrégé pour diagnostic.
  markFailed(error: string): void {
    this.props.status = 'failed'
    this.props.lastError = error
    this.props.processedAt = new Date()
    this.touch()
  }

  /// Annulation par l'utilisateur — autorisée uniquement tant que la
  /// publication n'a pas commencé à être traitée (état SCHEDULED).
  cancel(): void {
    if (this.props.status !== 'scheduled') {
      throw new ScheduledPostStateError(
        `Seule une publication SCHEDULED peut être annulée (état actuel : ${this.props.status}).`,
      )
    }
    this.props.status = 'cancelled'
    this.props.processedAt = new Date()
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
  get platforms(): ScheduledPostPlatform[] {
    return [...this.props.platforms]
  }
  get message(): string | null {
    return this.props.message
  }
  get caption(): string | null {
    return this.props.caption
  }
  get imageUrl(): string | null {
    return this.props.imageUrl
  }
  get videoUrl(): string | null {
    return this.props.videoUrl
  }
  /// Copie défensive à la sortie : muter l'objet renvoyé n'altère pas l'entité.
  get platformOptions(): ScheduledPlatformOptions | null {
    return this.props.platformOptions === null
      ? null
      : cloneScheduledPlatformOptions(this.props.platformOptions)
  }
  get scheduledAt(): Date {
    return this.props.scheduledAt
  }
  get status(): ScheduledPostStatus {
    return this.props.status
  }
  get attempts(): number {
    return this.props.attempts
  }
  get lastError(): string | null {
    return this.props.lastError
  }
  get processedAt(): Date | null {
    return this.props.processedAt
  }
  get createdAt(): Date {
    return this.props.createdAt
  }
  get updatedAt(): Date {
    return this.props.updatedAt
  }
}
