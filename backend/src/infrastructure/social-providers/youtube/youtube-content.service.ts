import { HttpService } from '@nestjs/axios'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { firstValueFrom } from 'rxjs'
import {
  MEDIA_READER_GATEWAY,
  type MediaReadDescriptor,
  type MediaReaderGateway,
} from '../../../application/media/ports/media-reader.gateway.js'
import { MediaAccessError } from '../../../application/media/errors/media-access.error.js'
import type {
  PublishYouTubeVideoInput,
  PublishYouTubeVideoResult,
  YouTubeContentGateway,
} from '../../../application/social/ports/youtube-content.gateway.js'
import { YouTubeContentError } from '../../../application/social/errors/youtube-content.error.js'
import {
  isYouTubePublishingEnabled,
  type YouTubeConfig,
} from '../../../config/youtube.config.js'
import { YouTubeResumableUploader } from './youtube-resumable-uploader.js'

/// Corps `snippet`/`status` de la ressource vidéo, tel qu'envoyé à Google.
interface YouTubeVideoResource {
  snippet: {
    title: string
    description?: string
    tags?: string[]
    categoryId?: string
  }
  status: {
    privacyStatus: string
    selfDeclaredMadeForKids: boolean
    containsSyntheticMedia?: boolean
  }
}

/// Implémentation réelle de la publication vidéo YouTube (Data API v3, upload
/// résumable). Trois étapes : résolution SÉCURISÉE du média local, création de
/// la session, puis transfert par blocs délégué à `YouTubeResumableUploader`.
///
/// SÉCURITÉ : seule une vidéo déjà uploadée sur Zernio est publiable. Aucune URL
/// distante fournie par l'utilisateur n'est téléchargée — ce qui ferme la porte
/// au SSRF, à la lecture de ressources internes et aux téléchargements non bornés.
///
/// Ce service porte SA PROPRE garde de configuration : le controller n'est pas la
/// seule protection, car l'orchestrateur (et demain le scheduler) l'atteignent
/// sans passer par HTTP.
@Injectable()
export class YouTubeContentService implements YouTubeContentGateway {
  private readonly logger = new Logger(YouTubeContentService.name)

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    @Inject(MEDIA_READER_GATEWAY)
    private readonly mediaReader: MediaReaderGateway,
    private readonly uploader: YouTubeResumableUploader,
  ) {}

  private get youtube(): YouTubeConfig {
    return this.config.getOrThrow<YouTubeConfig>('youtube')
  }

  async publishVideo(
    input: PublishYouTubeVideoInput,
  ): Promise<PublishYouTubeVideoResult> {
    const cfg = this.youtube
    this.assertPublishingEnabled(cfg)

    const media = await this.resolveVideo(input.videoUrl)
    const sessionUrl = await this.createSession(cfg, input, media)

    const { videoId } = await this.uploader.upload({
      accessToken: input.accessToken,
      sessionUrl,
      mediaRef: media.ref,
      totalSize: media.size,
      mimeType: media.mimeType,
      chunkSizeBytes: cfg.uploadChunkSizeBytes,
      maxRetries: cfg.uploadMaxRetries,
      retryBaseMs: cfg.uploadRetryBaseMs,
      requestTimeoutMs: cfg.uploadRequestTimeoutMs,
    })

    // Toujours `processing` : YouTube encode la vidéo en arrière-plan. Même si
    // la réponse portait `status.uploadStatus`, la marquer publiée serait
    // prématuré — la confirmation viendra de la réconciliation.
    return { videoId, processingState: 'processing' }
  }

  /// Garde d'infrastructure, indépendante du controller.
  private assertPublishingEnabled(cfg: YouTubeConfig): void {
    if (!isYouTubePublishingEnabled(cfg)) {
      throw new YouTubeContentError({
        serviceErrorCode: 'publishing_not_configured',
        httpStatus: 503,
        message:
          "La publication YouTube n'est pas configurée (credentials absents ou YOUTUBE_PUBLISHING_ENABLED=false).",
      })
    }
  }

  /// Résout l'URL vers un média local et vérifie qu'il est publiable.
  private async resolveVideo(videoUrl: string): Promise<MediaReadDescriptor> {
    let media: MediaReadDescriptor
    try {
      media = await this.mediaReader.resolvePublicUrl(videoUrl)
    } catch (err) {
      if (err instanceof MediaAccessError) {
        // Le code d'accès média est déjà un code de contenu sûr et stable.
        throw new YouTubeContentError({
          serviceErrorCode: err.code,
          httpStatus: 400,
          message: err.message,
        })
      }
      throw err
    }

    if (!media.mimeType.startsWith('video/')) {
      throw new YouTubeContentError({
        serviceErrorCode: 'invalid_media_type',
        httpStatus: 400,
        message: `Le média n'est pas une vidéo (${media.mimeType}).`,
      })
    }
    if (media.size <= 0) {
      throw new YouTubeContentError({
        serviceErrorCode: 'empty_media',
        httpStatus: 400,
        message: 'Le média est vide.',
      })
    }
    return media
  }

  /// Crée la session d'upload résumable et renvoie son URI (validée).
  private async createSession(
    cfg: YouTubeConfig,
    input: PublishYouTubeVideoInput,
    media: MediaReadDescriptor,
  ): Promise<string> {
    const params = new URLSearchParams({
      uploadType: 'resumable',
      part: 'snippet,status',
    })
    // Seule option de diffusion exposée en query ; les paramètres CMS
    // (onBehalfOfContentOwner*) n'ont aucun sens ici : le token désigne déjà
    // la chaîne autorisée.
    if (input.notifySubscribers !== undefined) {
      params.set('notifySubscribers', String(input.notifySubscribers))
    }

    let response
    try {
      response = await firstValueFrom(
        this.http.post<unknown>(
          `${cfg.uploadBaseUrl}/videos?${params.toString()}`,
          this.buildVideoResource(input),
          {
            headers: {
              Authorization: `Bearer ${input.accessToken}`,
              'Content-Type': 'application/json; charset=UTF-8',
              'X-Upload-Content-Length': String(media.size),
              'X-Upload-Content-Type': media.mimeType,
            },
            timeout: cfg.uploadRequestTimeoutMs,
            validateStatus: () => true,
          },
        ),
      )
    } catch {
      throw new YouTubeContentError({
        serviceErrorCode: 'upload_session_creation_failed',
        httpStatus: 0,
        message:
          "Impossible d'ouvrir une session d'upload YouTube (incident réseau).",
      })
    }

    if (response.status !== 200) {
      const reason = this.googleReason(response.data)
      throw new YouTubeContentError({
        serviceErrorCode: reason ?? 'upload_session_creation_failed',
        httpStatus: response.status,
        ...(reason ? { googleReason: reason } : {}),
        message: `Ouverture de la session d'upload YouTube refusée (HTTP ${response.status}${reason ? `, ${reason}` : ''}).`,
      })
    }

    const location = this.header(response.headers as never, 'location')
    if (!location) {
      throw new YouTubeContentError({
        serviceErrorCode: 'upload_session_location_missing',
        httpStatus: response.status,
        message: "Session d'upload YouTube sans en-tête Location.",
      })
    }
    return this.assertSessionUrl(location, cfg.uploadBaseUrl)
  }

  /// L'URI de session vient de Google, mais le backend va l'appeler : elle est
  /// donc validée comme n'importe quelle URL sortante (https, même origine que
  /// le host d'upload configuré). Sa valeur n'est jamais journalisée.
  private assertSessionUrl(location: string, uploadBaseUrl: string): string {
    let parsed: URL
    let base: URL
    try {
      parsed = new URL(location)
      base = new URL(uploadBaseUrl)
    } catch {
      throw this.invalidSessionUrl()
    }
    if (parsed.protocol !== 'https:') throw this.invalidSessionUrl()
    if (parsed.origin !== base.origin) throw this.invalidSessionUrl()
    return parsed.toString()
  }

  private invalidSessionUrl(): YouTubeContentError {
    return new YouTubeContentError({
      serviceErrorCode: 'upload_session_location_invalid',
      httpStatus: 502,
      message: "Session d'upload YouTube invalide (URL inattendue).",
    })
  }

  /// Métadonnées de la vidéo. Les propriétés absentes sont OMISES : aucune clé
  /// à `undefined`, et pas de `tags: []` — un tableau vide n'apporte rien et
  /// peut être refusé.
  private buildVideoResource(
    input: PublishYouTubeVideoInput,
  ): YouTubeVideoResource {
    const tags = input.tags?.filter((tag) => tag.trim().length > 0) ?? []
    return {
      snippet: {
        title: input.title,
        ...(input.description ? { description: input.description } : {}),
        ...(tags.length > 0 ? { tags } : {}),
        ...(input.categoryId ? { categoryId: input.categoryId } : {}),
      },
      status: {
        privacyStatus: input.privacyStatus,
        selfDeclaredMadeForKids: input.madeForKids,
        ...(input.containsSyntheticMedia !== undefined
          ? { containsSyntheticMedia: input.containsSyntheticMedia }
          : {}),
      },
    }
  }

  private googleReason(data: unknown): string | undefined {
    if (typeof data !== 'object' || data === null) return undefined
    const error = (data as { error?: { errors?: { reason?: unknown }[] } }).error
    const reason = error?.errors?.[0]?.reason
    return typeof reason === 'string' ? reason : undefined
  }

  private header(
    headers: Record<string, unknown> | undefined,
    name: string,
  ): string | null {
    if (!headers) return null
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === name && typeof value === 'string') return value
    }
    return null
  }
}
