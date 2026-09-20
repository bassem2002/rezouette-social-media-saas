import { HttpService } from '@nestjs/axios'
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { firstValueFrom } from 'rxjs'
import {
  MetaGraphGateway,
  MetaPageProfile,
  MetaPublishResult,
} from '../../../application/social/ports/meta-graph.gateway.js'
import {
  MetaGraphError,
  extractMetaErrorPayload,
} from '../../../application/social/errors/meta-graph.error.js'
import { MetaConfig } from '../../../config/meta.config.js'

/// Codes d'erreur "avant réponse" : la requête n'a jamais atteint Meta (aucun
/// `response` HTTP), donc rien n'a été publié → un nouvel essai est sûr
/// (idempotent). Couvre l'ETIMEDOUT de connexion observé après une coupure
/// réseau / mise en veille de la machine au moment où le scheduler se déclenche.
const RETRYABLE_NETWORK_CODES = new Set([
  'ETIMEDOUT',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
])
/// Nombre maximal de nouvelles tentatives (en plus de l'essai initial).
const MAX_RETRIES = 2
/// Base du backoff exponentiel entre deux tentatives (800ms → 1600ms).
const RETRY_BACKOFF_MS = 800

/// Attente de préparation d'un conteneur Instagram. La création du conteneur est
/// ASYNCHRONE : Meta télécharge puis transcode l'image de son côté, et refuse la
/// publication tant que ce travail n'est pas terminé (code 9007, « le contenu
/// n'est pas prêt à être publié »). Le délai dépend de la taille du média et de
/// la vitesse à laquelle Meta parvient à le télécharger — un tunnel de
/// développement est nettement plus lent qu'un CDN.
const CONTAINER_MAX_POLL_ATTEMPTS = 10
const CONTAINER_POLL_INTERVAL_MS = 1500

/// Implémentation Graph API des appels runtime (publication + lecture profil).
/// Seul endroit qui connaît axios/Graph pour ces opérations. Ne touche pas
/// à l'OAuth ni à la persistance.
@Injectable()
export class MetaGraphService implements MetaGraphGateway {
  private readonly logger = new Logger(MetaGraphService.name)

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  private get graphBaseUrl(): string {
    const meta = this.config.getOrThrow<MetaConfig>('meta')
    return `https://graph.facebook.com/${meta.graphVersion}`
  }

  async publishPagePost(
    pageId: string,
    pageAccessToken: string,
    message: string,
  ): Promise<MetaPublishResult> {
    try {
      const res = await this.withNetworkRetry('Publication Page', () =>
        firstValueFrom(
          this.http.post<{ id: string }>(
            `${this.graphBaseUrl}/${pageId}/feed`,
            null,
            { params: { message, access_token: pageAccessToken } },
          ),
        ),
      )
      return { id: res.data.id }
    } catch (err) {
      this.logger.error(`Publication Page ${pageId} échouée: ${this.describe(err)}`)
      throw new MetaGraphError(extractMetaErrorPayload(err))
    }
  }

  async publishPagePhoto(
    pageId: string,
    pageAccessToken: string,
    imageUrl: string,
    message: string,
  ): Promise<MetaPublishResult> {
    try {
      const res = await this.withNetworkRetry('Publication photo Page', () =>
        firstValueFrom(
          this.http.post<{ id: string; post_id?: string }>(
            `${this.graphBaseUrl}/${pageId}/photos`,
            null,
            {
              params: {
                url: imageUrl,
                caption: message,
                access_token: pageAccessToken,
              },
            },
          ),
        ),
      )
      // Graph renvoie l'id de la photo + le post_id du fil ; on privilégie
      // le post_id (format {pageId}_{postId}) pour rester cohérent avec /feed.
      return { id: res.data.post_id ?? res.data.id }
    } catch (err) {
      this.logger.error(
        `Publication photo Page ${pageId} échouée: ${this.describe(err)}`,
      )
      throw new MetaGraphError(extractMetaErrorPayload(err))
    }
  }

  async fetchPageProfile(
    pageId: string,
    pageAccessToken: string,
  ): Promise<MetaPageProfile> {
    try {
      const res = await this.withNetworkRetry('Lecture profil Page', () =>
        firstValueFrom(
          this.http.get<{ id: string; name: string }>(
            `${this.graphBaseUrl}/${pageId}`,
            { params: { fields: 'id,name', access_token: pageAccessToken } },
          ),
        ),
      )
      return { pageId: res.data.id, pageName: res.data.name }
    } catch (err) {
      this.logger.error(`Lecture profil Page ${pageId} échouée: ${this.describe(err)}`)
      throw new MetaGraphError(extractMetaErrorPayload(err))
    }
  }

  async publishInstagramImage(
    igUserId: string,
    pageAccessToken: string,
    imageUrl: string,
    caption: string,
  ): Promise<MetaPublishResult> {
    try {
      // 1. Création du conteneur média.
      const container = await this.withNetworkRetry(
        'Création conteneur Instagram',
        () =>
          firstValueFrom(
            this.http.post<{ id: string }>(
              `${this.graphBaseUrl}/${igUserId}/media`,
              null,
              {
                params: {
                  image_url: imageUrl,
                  caption,
                  access_token: pageAccessToken,
                },
              },
            ),
          ),
      )

      // 2. Attente de la fin du traitement côté Meta. Sans cela, l'étape 3
      // partait systématiquement trop tôt sur les médias un peu lourds.
      await this.awaitContainerReady(container.data.id, pageAccessToken)

      // 3. Publication du conteneur.
      const published = await this.withNetworkRetry(
        'Publication Instagram',
        () =>
          firstValueFrom(
            this.http.post<{ id: string }>(
              `${this.graphBaseUrl}/${igUserId}/media_publish`,
              null,
              {
                params: {
                  creation_id: container.data.id,
                  access_token: pageAccessToken,
                },
              },
            ),
          ),
      )
      return { id: published.data.id }
    } catch (err) {
      this.logger.error(
        `Publication Instagram ${igUserId} échouée: ${this.describe(err)}`,
      )
      throw new MetaGraphError(extractMetaErrorPayload(err))
    }
  }

  /// Attend qu'un conteneur Instagram soit publiable, en interrogeant son
  /// `status_code` jusqu'à un état terminal.
  ///
  /// Les états possibles sont IN_PROGRESS, FINISHED, ERROR, EXPIRED et
  /// PUBLISHED. Seuls FINISHED (et PUBLISHED, déjà traité) autorisent l'appel à
  /// `media_publish` ; publier trop tôt renvoie le code 9007.
  private async awaitContainerReady(
    containerId: string,
    pageAccessToken: string,
  ): Promise<void> {
    for (let attempt = 0; attempt < CONTAINER_MAX_POLL_ATTEMPTS; attempt += 1) {
      if (attempt > 0) await this.delay(CONTAINER_POLL_INTERVAL_MS)

      const res = await this.withNetworkRetry('Statut conteneur Instagram', () =>
        firstValueFrom(
          this.http.get<{ status_code?: string; status?: string }>(
            `${this.graphBaseUrl}/${containerId}`,
            {
              params: {
                fields: 'status_code,status',
                access_token: pageAccessToken,
              },
            },
          ),
        ),
      )

      const statusCode = res.data.status_code
      if (statusCode === 'FINISHED' || statusCode === 'PUBLISHED') return

      if (statusCode === 'ERROR' || statusCode === 'EXPIRED') {
        // Meta a bien récupéré la requête mais renonce au média lui-même
        // (format refusé, téléchargement échoué, conteneur périmé). Le détail
        // utile est dans `status`, pas dans `status_code`.
        throw new MetaGraphError({
          code: 9004,
          message:
            res.data.status ??
            `Instagram a rejeté le média (conteneur ${statusCode.toLowerCase()}).`,
        })
      }
      // Sinon IN_PROGRESS : on laisse Meta finir son traitement.
    }

    // Fenêtre épuisée : le conteneur reste valide 24 h côté Meta, mais rien ne
    // sert de bloquer la requête HTTP plus longtemps. Republier relancera le
    // cycle — d'où une erreur explicitement réessayable.
    throw new MetaGraphError({
      code: 9007,
      message:
        `Instagram prépare encore le média après ` +
        `${(CONTAINER_MAX_POLL_ATTEMPTS * CONTAINER_POLL_INTERVAL_MS) / 1000} s. ` +
        'Réessayez dans un instant.',
    })
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /// Vrai si l'erreur est un échec de connexion transitoire (et non une erreur
  /// applicative Meta) : absence de `response` HTTP + code réseau réessayable.
  private isRetryableNetworkError(err: unknown): boolean {
    if (typeof err !== 'object' || err === null) return false
    const e = err as { response?: unknown; code?: string }
    if (e.response) return false // Meta a répondu → erreur applicative, pas réseau.
    return typeof e.code === 'string' && RETRYABLE_NETWORK_CODES.has(e.code)
  }

  /// Exécute un appel Graph en réessayant uniquement les échecs de connexion
  /// transitoires (backoff exponentiel). Les erreurs applicatives Meta (avec
  /// `response`) ne sont JAMAIS réessayées. Point unique de robustesse réseau,
  /// partagé par la publication immédiate ET programmée (aucune duplication).
  private async withNetworkRetry<T>(
    label: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await operation()
      } catch (err) {
        if (attempt >= MAX_RETRIES || !this.isRetryableNetworkError(err)) {
          throw err
        }
        const delay = RETRY_BACKOFF_MS * 2 ** attempt
        const code = (err as { code?: string }).code
        this.logger.warn(
          `${label}: erreur réseau transitoire (${code}) — nouvel essai ` +
            `${attempt + 1}/${MAX_RETRIES} dans ${delay} ms`,
        )
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }

  /// Extrait un message lisible sans jamais logger de token.
  private describe(err: unknown): string {
    if (typeof err === 'object' && err !== null && 'response' in err) {
      const response = (err as { response?: { data?: unknown } }).response
      if (response?.data) {
        return JSON.stringify(response.data)
      }
    }
    return err instanceof Error ? err.message : String(err)
  }
}
