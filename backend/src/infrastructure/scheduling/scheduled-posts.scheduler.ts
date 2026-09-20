import { Injectable, Logger } from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import { ProcessDueScheduledPostsUseCase } from '../../application/scheduled-post/use-cases/process-due-scheduled-posts.use-case.js'

/// Fréquence du balayage des publications dues. 30 s offre une latence de
/// publication acceptable sans marteler la base. Surchargeable via
/// SCHEDULER_INTERVAL_MS (ex. tests, environnements à forte charge).
const TICK_MS = Number(process.env['SCHEDULER_INTERVAL_MS'] ?? 30_000)

/// Déclencheur périodique (couche infrastructure) : seul point qui connaît le
/// timer. Délègue toute la logique métier au use case. Un verrou en mémoire
/// empêche le chevauchement de deux cycles si une publication est lente.
@Injectable()
export class ScheduledPostsScheduler {
  private readonly logger = new Logger(ScheduledPostsScheduler.name)
  private running = false

  constructor(
    private readonly processDue: ProcessDueScheduledPostsUseCase,
  ) {}

  @Interval('scheduled-posts-dispatch', TICK_MS)
  async handleTick(): Promise<void> {
    if (this.running) {
      // Cycle précédent encore en cours : on saute ce tick (pas d'empilement).
      return
    }
    this.running = true
    try {
      const result = await this.processDue.execute()
      if (result.processed > 0) {
        this.logger.log(
          `Scheduler: ${result.processed} traitée(s) — ` +
            `${result.published} publiée(s), ${result.failed} en échec.`,
        )
      }
    } catch (err) {
      // Ne jamais laisser une exception remonter dans le timer (sinon tick perdu
      // sans trace). On loggue et on rouvre le verrou dans le finally.
      const message = err instanceof Error ? err.message : String(err)
      this.logger.error(`Scheduler: cycle interrompu → ${message}`)
    } finally {
      this.running = false
    }
  }
}
