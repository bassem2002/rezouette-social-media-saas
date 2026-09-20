import { Inject, Injectable, Logger } from '@nestjs/common'
import { SCHEDULED_POST_REPOSITORY } from '../../../domain/scheduled-post/repositories/scheduled-post.repository.js'
import type { ScheduledPostRepository } from '../../../domain/scheduled-post/repositories/scheduled-post.repository.js'
import { ScheduledPost } from '../../../domain/scheduled-post/entities/scheduled-post.entity.js'
import { ScheduledPostStateError } from '../../../domain/scheduled-post/entities/scheduled-post.entity.js'
import { PublishSocialUseCase } from '../../social/use-cases/publish-social.use-case.js'
import type { OrchestratedPlatform } from '../../social/use-cases/publish-social.use-case.js'
import type { ScheduledPostPlatform } from '../../../domain/scheduled-post/entities/scheduled-post.entity.js'
import {
  YouTubeScheduleOptionsError,
  resolveYouTubeScheduleOptions,
} from '../../../domain/scheduled-post/value-objects/youtube-schedule-options.js'
import type { YouTubeVideoOptions } from '../../../domain/social/value-objects/youtube-video-options.js'

/// Taille maximale du lot traité par cycle — borne la charge d'un tick et évite
/// qu'un retard accumulé ne sature l'event loop.
const BATCH_SIZE = 25

/// Réseaux ORCHESTRABLES ET PROGRAMMABLES aujourd'hui — désormais tous ceux que
/// l'orchestrateur sait publier, YouTube compris.
export type SchedulableOrchestratedPlatform = OrchestratedPlatform

const SCHEDULABLE_PLATFORMS = [
  'facebook',
  'instagram',
  'tiktok',
  'linkedin',
  'youtube',
] as const satisfies readonly SchedulableOrchestratedPlatform[]

/// Garde-fou de compilation : si un réseau est ajouté à l'orchestrateur sans
/// être listé ici, cette ligne échoue — impossible de l'oublier silencieusement.
/// La liste explicite reste nécessaire pour refuser proprement une ligne
/// insérée hors API qui ciblerait une plateforme inconnue du scheduler.
type AssertNever<T extends never> = T
type _AllSchedulableCovered = AssertNever<
  Exclude<SchedulableOrchestratedPlatform, (typeof SCHEDULABLE_PLATFORMS)[number]>
>

function isSchedulable(
  platform: ScheduledPostPlatform,
): platform is SchedulableOrchestratedPlatform {
  return (SCHEDULABLE_PLATFORMS as readonly string[]).includes(platform)
}

export interface ProcessDueResult {
  processed: number
  published: number
  failed: number
}

/// Traite les publications programmées arrivées à échéance. Pour chacune :
/// 1. réservation atomique SCHEDULED → PROCESSING (persistée avant l'envoi) ;
/// 2. délégation à PublishSocialUseCase — qui crée les lignes d'historique
///  SocialPost via le PublicationRecorder (AUCUNE duplication de logique) ;
/// 3. transition terminale PUBLISHED (tout réussi) ou FAILED (au moins un échec).
/// Chaque publication est isolée : une erreur n'interrompt pas le reste du lot.
@Injectable()
export class ProcessDueScheduledPostsUseCase {
  private readonly logger = new Logger(ProcessDueScheduledPostsUseCase.name)

  constructor(
    @Inject(SCHEDULED_POST_REPOSITORY)
    private readonly scheduledPosts: ScheduledPostRepository,
    private readonly publishSocial: PublishSocialUseCase,
  ) {}

  async execute(now: Date = new Date()): Promise<ProcessDueResult> {
    const due = await this.scheduledPosts.findDue(now, BATCH_SIZE)
    const result: ProcessDueResult = { processed: 0, published: 0, failed: 0 }

    for (const post of due) {
      const reserved = await this.reserve(post)
      if (!reserved) continue

      result.processed += 1
      const ok = await this.publishOne(post)
      if (ok) result.published += 1
      else result.failed += 1
    }

    return result
  }

  /// Réserve la publication (SCHEDULED → PROCESSING) et persiste l'état avant
  /// tout appel réseau. Renvoie false si la transition est invalide (déjà prise).
  private async reserve(post: ScheduledPost): Promise<boolean> {
    try {
      post.markProcessing()
    } catch (err) {
      if (err instanceof ScheduledPostStateError) return false
      throw err
    }
    await this.scheduledPosts.save(post)
    return true
  }

  /// Reconstitue les options YouTube VALIDÉES depuis la planification.
  ///
  /// `post.platformOptions` renvoie déjà une copie défensive de l'entité ; la
  /// résolution produit ensuite un objet neuf. Ni le JSON persisté, ni une
  /// référence mutable du domaine n'atteignent donc l'orchestrateur.
  ///
  /// `videoUrl` est exigée ici aussi : la validation faite à la création ne
  /// couvre pas une ligne insérée directement en base.
  private resolveYouTubeOptions(post: ScheduledPost): YouTubeVideoOptions {
    if (!post.videoUrl?.trim()) {
      throw new YouTubeScheduleOptionsError(
        'videoUrl est requise pour publier sur YouTube.',
      )
    }
    return resolveYouTubeScheduleOptions(post.platformOptions?.youtube)
  }

  /// Publie réellement via l'orchestrateur multi-réseaux et applique la
  /// transition terminale. Renvoie true si toutes les plateformes ont réussi.
  private async publishOne(post: ScheduledPost): Promise<boolean> {
    try {
      const unsupported = post.platforms.filter((p) => !isSchedulable(p))
      if (unsupported.length > 0) {
        const message = `Plateforme(s) non encore programmable(s) : ${unsupported.join(', ')}.`
        post.markFailed(message)
        await this.scheduledPosts.save(post)
        this.logger.warn(`Publication programmée ${post.id} ignorée → ${message}`)
        return false
      }

      const platforms = post.platforms.filter(isSchedulable)

      // Options YouTube : résolues ICI, avant tout appel réseau. Une ligne
      // historique ou insérée hors API peut être incomplète — elle échoue alors
      // proprement, sans upload ni appel Google.
      let youtubeOptions: YouTubeVideoOptions | undefined
      if (platforms.includes('youtube')) {
        try {
          youtubeOptions = this.resolveYouTubeOptions(post)
        } catch (err) {
          if (!(err instanceof YouTubeScheduleOptionsError)) throw err
          const message = `YouTube : ${err.message}`
          post.markFailed(message)
          await this.scheduledPosts.save(post)
          this.logger.warn(
            `Publication programmée ${post.id} invalide → ${message}`,
          )
          return false
        }
      }

      const outcome = await this.publishSocial.execute({
        userId: post.userId,
        platforms,
        message: post.message ?? undefined,
        caption: post.caption ?? undefined,
        imageUrl: post.imageUrl ?? undefined,
        videoUrl: post.videoUrl ?? undefined,
        // Objet-valeur validé, jamais le JSON persisté ni une référence mutable.
        ...(youtubeOptions ? { youtubeOptions } : {}),
      })

      if (outcome.success) {
        post.markPublished()
        await this.scheduledPosts.save(post)
        return true
      }

      const reasons = outcome.results
        .filter((r) => !r.success)
        .map((r) => `${r.platform}: ${r.error ?? 'échec'}`)
        .join(' | ')
      post.markFailed(reasons || 'Échec de publication.')
      await this.scheduledPosts.save(post)
      this.logger.warn(
        `Publication programmée ${post.id} en échec → ${reasons}`,
      )
      return false
    } catch (err) {
      // Filet de sécurité : l'orchestrateur isole déjà les erreurs Meta, mais on
      // garantit qu'aucune exception ne laisse la publication bloquée en PROCESSING.
      const message = err instanceof Error ? err.message : String(err)
      post.markFailed(message)
      await this.scheduledPosts.save(post)
      this.logger.error(
        `Publication programmée ${post.id} : erreur inattendue → ${message}`,
      )
      return false
    }
  }
}
