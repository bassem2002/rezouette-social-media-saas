import { Injectable, type Provider } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  YOUTUBE_CONTENT_GATEWAY,
  type PublishYouTubeVideoResult,
  type YouTubeContentGateway,
} from '../../../application/social/ports/youtube-content.gateway.js'
import { YouTubeContentError } from '../../../application/social/errors/youtube-content.error.js'
import {
  isYouTubePublishingEnabled,
  type YouTubeConfig,
} from '../../../config/youtube.config.js'
import { YouTubeContentService } from './youtube-content.service.js'

/// Adaptateur « publication désactivée ». N'émet AUCUN appel réseau, n'ouvre
/// AUCUN fichier, ne lit JAMAIS la vidéo : il rejette immédiatement une erreur
/// normalisée que le use case archive en PUBLISHING_NOT_CONFIGURED.
///
/// Aucune dépendance injectée — pas même HttpService : il est structurellement
/// incapable d'émettre une requête.
@Injectable()
export class DisabledYouTubeContentService implements YouTubeContentGateway {
  publishVideo(): Promise<PublishYouTubeVideoResult> {
    return Promise.reject(
      new YouTubeContentError({
        serviceErrorCode: 'publishing_not_configured',
        httpStatus: 503,
        message:
          "La publication YouTube n'est pas configurée (adaptateur d'upload non disponible).",
      }),
    )
  }
}

/// Sélection de l'adaptateur de publication YouTube, sur le modèle de
/// `linkedinContentGatewayProvider` :
/// - credentials absents OU `YOUTUBE_PUBLISHING_ENABLED=false`
///   → `DisabledYouTubeContentService` (zéro appel réseau) ;
/// - credentials complets ET flag levé
///   → `YouTubeContentService` (upload résumable réel).
///
/// La sélection se fait au démarrage : changer le flag exige un redémarrage,
/// comme pour LinkedIn. `YouTubeContentService` conserve néanmoins sa propre
/// garde de configuration — la sécurité ne repose ni sur ce provider seul, ni
/// sur le controller, car l'orchestrateur et le futur scheduler l'atteignent
/// directement.
export const youtubeContentGatewayProvider: Provider = {
  provide: YOUTUBE_CONTENT_GATEWAY,
  inject: [ConfigService, YouTubeContentService, DisabledYouTubeContentService],
  useFactory: (
    config: ConfigService,
    real: YouTubeContentService,
    disabled: DisabledYouTubeContentService,
  ): YouTubeContentGateway => {
    const youtube = config.getOrThrow<YouTubeConfig>('youtube')
    return isYouTubePublishingEnabled(youtube) ? real : disabled
  },
}
