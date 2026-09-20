import { Injectable, Logger } from '@nestjs/common'
import { PublishFacebookUseCase } from './publish-facebook.use-case.js'
import { PublishInstagramUseCase } from './publish-instagram.use-case.js'
import { PublishTikTokUseCase } from './publish-tiktok.use-case.js'
import { PublishLinkedInUseCase } from './publish-linkedin.use-case.js'
import { PublishYouTubeUseCase } from './publish-youtube.use-case.js'
import type { YouTubePublicationOutcome } from './publish-youtube.use-case.js'
import type { YouTubePrivacyStatus } from '../../../domain/social/value-objects/youtube-video-options.js'
import type { PublicationOutcome } from '../../social-post/services/publication-recorder.js'

/// Plateformes orchestrables. Aligné sur PublishSocialDto côté présentation.
export type OrchestratedPlatform =
  | 'facebook'
  | 'instagram'
  | 'tiktok'
  | 'linkedin'
  | 'youtube'

/// Options propres à YouTube, regroupées plutôt que dispersées à la racine :
/// elles n'ont de sens que pour ce réseau, et la chaîne cible doit être explicite.
export interface YouTubePublishOptions {
  accountId: string
  title: string
  description?: string
  tags?: string[]
  categoryId?: string
  privacyStatus?: YouTubePrivacyStatus
  madeForKids: boolean
  containsSyntheticMedia?: boolean
  notifySubscribers?: boolean
}

export interface PublishSocialInput {
  userId: string
  platforms: OrchestratedPlatform[]
  message?: string
  caption?: string
  imageUrl?: string
  /// URL publique de la vidéo (requise si `tiktok` ou `youtube` est ciblé).
  videoUrl?: string
  /// Lien/article — consommé UNIQUEMENT par LinkedIn (publication immédiate).
  linkUrl?: string
  linkTitle?: string
  linkDescription?: string
  /// Options YouTube — requises si `youtube` est ciblé, ignorées sinon.
  youtubeOptions?: YouTubePublishOptions
}

/// Résultat de publication pour une plateforme. En cas de succès :
/// `externalPostId`. En cas d'échec Meta : `error` (message) + diagnostic
/// normalisé (code/subcode/reason/retryable/action) issu de MetaExceptionMapper.
export interface PublishPlatformResult {
  platform: OrchestratedPlatform
  success: boolean
  externalPostId?: string
  error?: string
  code?: number
  subcode?: number
  reason?: string
  retryable?: boolean
  action?: string
  /// YouTube : vidéo acceptée mais encore en traitement côté fournisseur —
  /// la publication n'est PAS encore effective.
  processing?: boolean
  /// YouTube : identifiant de la vidéo, connu dès l'acceptation.
  publishId?: string
}

export interface PublishSocialResult {
  success: boolean
  results: PublishPlatformResult[]
}

/// Orchestrateur multi-réseaux. Délègue à PublishFacebookUseCase et
/// PublishInstagramUseCase (aucune duplication de logique de publication) et
/// isole les échecs : une plateforme en erreur n'interrompt pas les autres.
///
/// Historique : la persistance d'un SocialPost (PENDING → PUBLISHED/FAILED) est
/// assurée par les use-cases délégués via le PublicationRecorder. L'orchestrateur
/// n'enregistre donc rien lui-même — chaque plateforme produit exactement une
/// ligne d'historique, sans double écriture.
@Injectable()
export class PublishSocialUseCase {
  private readonly logger = new Logger(PublishSocialUseCase.name)

  constructor(
    private readonly publishFacebook: PublishFacebookUseCase,
    private readonly publishInstagram: PublishInstagramUseCase,
    private readonly publishTikTok: PublishTikTokUseCase,
    private readonly publishLinkedIn: PublishLinkedInUseCase,
    private readonly publishYouTube: PublishYouTubeUseCase,
  ) {}

  async execute(input: PublishSocialInput): Promise<PublishSocialResult> {
    // Publication en parallèle : chaque plateforme est isolée, un échec ne
    // rejette jamais la promesse globale.
    const results = await Promise.all(
      input.platforms.map((platform) => this.publishOne(platform, input)),
    )

    return {
      success: results.every((r) => r.success),
      results,
    }
  }

  private async publishOne(
    platform: OrchestratedPlatform,
    input: PublishSocialInput,
  ): Promise<PublishPlatformResult> {
    try {
      const outcome = await this.dispatch(platform, input)
      if (outcome.success) {
        return {
          platform,
          success: true,
          ...(outcome.externalPostId
            ? { externalPostId: outcome.externalPostId }
            : {}),
          // YouTube expose en plus l'état de traitement et l'id de la vidéo.
          ...('processing' in outcome
            ? { processing: outcome.processing, publishId: outcome.publishId }
            : {}),
        }
      }
      // Échec Meta classifié (le recorder l'a déjà archivé en FAILED).
      this.logger.warn(
        `Publication ${platform} échouée [${outcome.error.reason}]: ${outcome.message}`,
      )
      return {
        platform,
        success: false,
        error: outcome.message,
        code: outcome.error.code,
        subcode: outcome.error.subcode,
        reason: outcome.error.reason,
        retryable: outcome.error.retryable,
        action: outcome.error.action,
      }
    } catch (err) {
      // Erreur de précondition (ex. aucun compte actif → NotFoundException),
      // hors périmètre Meta : on isole sans diagnostic Graph.
      const message = err instanceof Error ? err.message : String(err)
      this.logger.warn(`Publication ${platform} échouée: ${message}`)
      return { platform, success: false, error: message }
    }
  }

  private dispatch(
    platform: OrchestratedPlatform,
    input: PublishSocialInput,
  ): Promise<PublicationOutcome | YouTubePublicationOutcome> {
    switch (platform) {
      case 'facebook':
        return this.publishFacebook.execute({
          userId: input.userId,
          message: input.message ?? '',
          imageUrl: input.imageUrl,
        })
      case 'instagram':
        return this.publishInstagram.execute({
          userId: input.userId,
          imageUrl: input.imageUrl ?? '',
          caption: input.caption ?? '',
        })
      case 'tiktok':
        if (!input.videoUrl) {
          // Précondition isolée par platform : publishOne la convertit en échec
          // TikTok sans interrompre les autres réseaux.
          throw new Error(
            'La vidéo (videoUrl) est requise pour publier sur TikTok.',
          )
        }
        return this.publishTikTok.execute({
          userId: input.userId,
          videoUrl: input.videoUrl,
          caption: input.caption ?? input.message ?? '',
        })
      case 'linkedin':
        // Multi-réseaux : LinkedIn utilise le texte (message/caption), une image
        // éventuelle et un lien/article éventuel. Un échec LinkedIn (ex.
        // PUBLISHING_NOT_CONFIGURED) est isolé par publishOne.
        return this.publishLinkedIn.execute({
          userId: input.userId,
          text: input.message ?? input.caption ?? '',
          imageUrl: input.imageUrl,
          linkUrl: input.linkUrl,
          linkTitle: input.linkTitle,
          linkDescription: input.linkDescription,
        })
      case 'youtube':
        return this.publishYouTube.execute(this.youtubeInput(input))
    }
  }

  /// Vérifie les préconditions propres à YouTube et construit l'entrée du use
  /// case. Comme pour TikTok, une précondition manquante est levée en `Error` :
  /// `publishOne` l'isole en échec YouTube sans interrompre les autres réseaux.
  private youtubeInput(input: PublishSocialInput) {
    if (!input.videoUrl) {
      throw new Error('La vidéo (videoUrl) est requise pour publier sur YouTube.')
    }
    const options = input.youtubeOptions
    if (!options) {
      throw new Error(
        'youtubeOptions est requis pour publier sur YouTube (chaîne, titre, madeForKids).',
      )
    }
    if (!options.accountId?.trim()) {
      throw new Error(
        'youtubeOptions.accountId est requis : la chaîne cible doit être explicite.',
      )
    }
    if (!options.title?.trim()) {
      throw new Error('youtubeOptions.title est requis pour publier sur YouTube.')
    }
    if (typeof options.madeForKids !== 'boolean') {
      throw new Error(
        'youtubeOptions.madeForKids est requis (déclaration COPPA obligatoire).',
      )
    }
    return {
      userId: input.userId,
      accountId: options.accountId,
      videoUrl: input.videoUrl,
      title: options.title,
      madeForKids: options.madeForKids,
      ...(options.description !== undefined
        ? { description: options.description }
        : {}),
      ...(options.tags !== undefined ? { tags: options.tags } : {}),
      ...(options.categoryId !== undefined
        ? { categoryId: options.categoryId }
        : {}),
      ...(options.privacyStatus !== undefined
        ? { privacyStatus: options.privacyStatus }
        : {}),
      ...(options.containsSyntheticMedia !== undefined
        ? { containsSyntheticMedia: options.containsSyntheticMedia }
        : {}),
      ...(options.notifySubscribers !== undefined
        ? { notifySubscribers: options.notifySubscribers }
        : {}),
    }
  }
}
