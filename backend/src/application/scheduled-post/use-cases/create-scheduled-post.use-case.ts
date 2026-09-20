import { BadRequestException, Inject, Injectable } from '@nestjs/common'
import { ScheduledPost } from '../../../domain/scheduled-post/entities/scheduled-post.entity.js'
import type { ScheduledPostPlatform } from '../../../domain/scheduled-post/entities/scheduled-post.entity.js'
import { SCHEDULED_POST_REPOSITORY } from '../../../domain/scheduled-post/repositories/scheduled-post.repository.js'
import type { ScheduledPostRepository } from '../../../domain/scheduled-post/repositories/scheduled-post.repository.js'
import type { ScheduledPlatformOptions } from '../../../domain/scheduled-post/value-objects/scheduled-platform-options.js'
import {
  YouTubeScheduleOptionsError,
  resolveYouTubeScheduleOptions,
} from '../../../domain/scheduled-post/value-objects/youtube-schedule-options.js'
import { SOCIAL_ACCOUNT_REPOSITORY } from '../../../domain/social-account/repositories/social-account.repository.js'
import type { SocialAccountRepository } from '../../../domain/social-account/repositories/social-account.repository.js'

export interface CreateScheduledPostInput {
  userId: string
  platforms: ScheduledPostPlatform[]
  scheduledAt: string
  message?: string
  caption?: string
  imageUrl?: string
  videoUrl?: string
  /// Options spécifiques par plateforme, simplement mémorisées avec la
  /// planification (aucun invariant par réseau à ce stade).
  platformOptions?: ScheduledPlatformOptions | null
}

/// Crée une publication programmée (état SCHEDULED). Centralise les invariants
/// métier de la planification : date future, image obligatoire dès qu'Instagram
/// est ciblé (l'API Instagram exige une URL média publique), et vidéo obligatoire
/// dès que TikTok est ciblé (Content Posting API vidéo). Ne publie rien : l'envoi
/// est déclenché plus tard par le scheduler.
@Injectable()
export class CreateScheduledPostUseCase {
  constructor(
    @Inject(SCHEDULED_POST_REPOSITORY)
    private readonly scheduledPosts: ScheduledPostRepository,
    @Inject(SOCIAL_ACCOUNT_REPOSITORY)
    private readonly socialAccounts: SocialAccountRepository,
  ) {}

  async execute(input: CreateScheduledPostInput): Promise<ScheduledPost> {
    const scheduledAt = new Date(input.scheduledAt)
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('scheduledAt est une date invalide.')
    }
    if (scheduledAt.getTime() <= Date.now()) {
      throw new BadRequestException(
        'scheduledAt doit être une date future.',
      )
    }

    if (
      input.platforms.includes('instagram') &&
      !input.imageUrl?.trim()
    ) {
      throw new BadRequestException(
        'imageUrl est requise lorsque Instagram fait partie des plateformes.',
      )
    }

    if (input.platforms.includes('tiktok') && !input.videoUrl?.trim()) {
      throw new BadRequestException(
        'videoUrl est requise lorsque TikTok fait partie des plateformes.',
      )
    }

    if (
      input.platforms.includes('linkedin') &&
      !input.message?.trim() &&
      !input.caption?.trim() &&
      !input.imageUrl?.trim()
    ) {
      throw new BadRequestException(
        'Un texte (message/caption) ou une image (imageUrl) est requis lorsque LinkedIn fait partie des plateformes.',
      )
    }

    const platformOptions = await this.resolvePlatformOptions(input)

    const post = ScheduledPost.schedule({
      userId: input.userId,
      platforms: input.platforms,
      scheduledAt,
      message: input.message?.trim() || null,
      caption: input.caption?.trim() || null,
      imageUrl: input.imageUrl?.trim() || null,
      videoUrl: input.videoUrl?.trim() || null,
      platformOptions,
    })

    await this.scheduledPosts.save(post)
    return post
  }

  /// Valide et NORMALISE les options par plateforme.
  ///
  /// Contrairement à la publication immédiate, où chaque réseau échoue de son
  /// côté, une planification doit produire un job COHÉRENT OU AUCUN JOB : une
  /// ligne impubliable n'a aucune raison d'attendre son échéance pour échouer.
  private async resolvePlatformOptions(
    input: CreateScheduledPostInput,
  ): Promise<ScheduledPlatformOptions | null> {
    const targetsYouTube = input.platforms.includes('youtube')
    const youtubeOptions = input.platformOptions?.youtube

    // Des options sans la plateforme correspondante : refus explicite plutôt
    // qu'un stockage silencieux de données qui ne serviront jamais.
    if (!targetsYouTube && youtubeOptions) {
      throw new BadRequestException(
        "platformOptions.youtube a été fourni alors que 'youtube' ne fait pas partie des plateformes ciblées.",
      )
    }
    if (!targetsYouTube) {
      return input.platformOptions ?? null
    }

    if (!input.videoUrl?.trim()) {
      throw new BadRequestException(
        'videoUrl est requise lorsque YouTube fait partie des plateformes.',
      )
    }

    // Mêmes règles qu'à la publication : une seule fonction métier, appelée aux
    // deux moments — impossible qu'une planification acceptée ici soit rejetée
    // là-bas pour une raison de forme.
    let resolved
    try {
      resolved = resolveYouTubeScheduleOptions(youtubeOptions)
    } catch (err) {
      if (err instanceof YouTubeScheduleOptionsError) {
        throw new BadRequestException(err.message)
      }
      throw err
    }

    await this.assertOwnedYouTubeChannel(input.userId, resolved.accountId)

    return { ...input.platformOptions, youtube: resolved }
  }

  /// Vérifie que la chaîne ciblée appartient bien à l'utilisateur et qu'elle est
  /// YouTube. Volontairement LIMITÉ à cela : ni token, ni scope, ni feature flag.
  ///
  /// Ces états peuvent tous changer d'ici l'échéance — un token expirera de
  /// toute façon avant, et sera rafraîchi au moment de publier. Les contrôler
  /// ici rejetterait des planifications parfaitement valides.
  private async assertOwnedYouTubeChannel(
    userId: string,
    accountId: string,
  ): Promise<void> {
    const accounts = await this.socialAccounts.findByUserId(userId)
    const channel = accounts.find(
      (account) => account.id === accountId && account.platform === 'youtube',
    )
    if (!channel) {
      throw new BadRequestException(
        "La chaîne YouTube ciblée (accountId) est introuvable pour cet utilisateur.",
      )
    }
  }
}
