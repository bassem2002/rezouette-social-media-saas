import { Injectable, Logger } from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import {
  YOUTUBE_DEFAULT_RECONCILE_INTERVAL_MS,
  YOUTUBE_RECONCILE_INTERVAL_ENV,
} from '../../config/youtube.config.js'
import { ReconcileYouTubeVideosUseCase } from '../../application/social/use-cases/reconcile-youtube-videos.use-case.js'

/// Cadence du balayage. Lue au CHARGEMENT DU MODULE : `@Interval` fige sa
/// période à la construction du décorateur, avant que la DI ne soit disponible —
/// même contrainte que `ScheduledPostsScheduler` avec SCHEDULER_INTERVAL_MS.
const TICK_MS = YOUTUBE_RECONCILE_INTERVAL_ENV()

/// Déclencheur périodique de la réconciliation YouTube (couche infrastructure).
/// Seul point qui connaît le timer ; toute la logique vit dans le use case.
///
/// Ce scheduler NE fait jamais : d'accès Prisma, d'appel HTTP, de refresh, de
/// classification de statut, ni la moindre écriture sur un SocialPost.
///
/// ⚠️ MONO-INSTANCE : le verrou est un booléen en mémoire. Deux instances
/// traiteraient le même lot. `videos.list` est une lecture idempotente, mais
/// deux transitions concurrentes provoqueraient des écritures redondantes sur la
/// même ligne. Un verrou distribué ou une réservation atomique en base sera
/// nécessaire avant tout scale-out — même dette que ScheduledPostsScheduler.
@Injectable()
export class YouTubeProcessingScheduler {
  private readonly logger = new Logger(YouTubeProcessingScheduler.name)
  private running = false

  constructor(private readonly reconcile: ReconcileYouTubeVideosUseCase) {}

  @Interval('youtube-processing-reconcile', TICK_MS)
  async handleTick(): Promise<void> {
    if (this.running) {
      // Cycle précédent encore en cours : on saute ce tick (pas d'empilement).
      return
    }
    this.running = true
    try {
      const summary = await this.reconcile.execute()
      if (summary.scanned > 0) {
        // Résumé de compteurs uniquement : aucun identifiant de vidéo, aucun
        // token, aucune URL.
        this.logger.log(
          `Réconciliation YouTube : ${summary.scanned} examinée(s) — ` +
            `${summary.published} publiée(s), ${summary.failed} en échec ` +
            `(dont ${summary.stale} expirée(s)), ` +
            `${summary.stillProcessing} en traitement, ${summary.deferred} différée(s).`,
        )
      }
    } catch (err) {
      // Ne jamais laisser une exception remonter dans le timer : le tick suivant
      // doit rester programmé.
      const message = err instanceof Error ? err.message : String(err)
      this.logger.error(`Réconciliation YouTube : cycle interrompu → ${message}`)
    } finally {
      this.running = false
    }
  }
}
