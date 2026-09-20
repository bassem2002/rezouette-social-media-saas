import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { SocialController } from './social.controller.js'
import { LinkedInController } from './linkedin.controller.js'
import { YouTubeController } from './youtube.controller.js'
import { META_GRAPH_GATEWAY } from '../../application/social/ports/meta-graph.gateway.js'
import { MetaGraphService } from '../../infrastructure/social-providers/meta/meta-graph.service.js'
import { TIKTOK_CONTENT_GATEWAY } from '../../application/social/ports/tiktok-content.gateway.js'
import { TikTokContentService } from '../../infrastructure/social-providers/tiktok/tiktok-content.service.js'
import { TikTokFileUploader } from '../../infrastructure/social-providers/tiktok/tiktok-file-uploader.js'
import { TIKTOK_OAUTH_GATEWAY } from '../../application/auth/ports/tiktok-oauth.gateway.js'
import { TikTokOAuthService } from '../../infrastructure/social-providers/tiktok/tiktok-oauth.service.js'
import { PublishFacebookTestPostUseCase } from '../../application/social/use-cases/publish-facebook-test-post.use-case.js'
import { GetFacebookPagesUseCase } from '../../application/social/use-cases/get-facebook-pages.use-case.js'
import { GetInstagramAccountsUseCase } from '../../application/social/use-cases/get-instagram-accounts.use-case.js'
import { GetConnectedAccountsUseCase } from '../../application/social/use-cases/get-connected-accounts.use-case.js'
import { DebugTokenUseCase } from '../../application/social/use-cases/debug-token.use-case.js'
import { GetFacebookProfileUseCase } from '../../application/social/use-cases/get-facebook-profile.use-case.js'
import { PublishInstagramTestPostUseCase } from '../../application/social/use-cases/publish-instagram-test-post.use-case.js'
import { PublishFacebookUseCase } from '../../application/social/use-cases/publish-facebook.use-case.js'
import { PublishInstagramUseCase } from '../../application/social/use-cases/publish-instagram.use-case.js'
import { PublishTikTokUseCase } from '../../application/social/use-cases/publish-tiktok.use-case.js'
import { PublishSocialUseCase } from '../../application/social/use-cases/publish-social.use-case.js'
import { PublicationRecorder } from '../../application/social-post/services/publication-recorder.js'
import { MetaExceptionMapper } from '../../application/social/services/meta-exception-mapper.js'
import { TikTokExceptionMapper } from '../../application/social/services/tiktok-exception-mapper.js'
import { MetaTokenService } from '../../application/social/services/meta-token.service.js'
import { TikTokTokenService } from '../../application/social/services/tiktok-token.service.js'
import { GetMetaTokenStatusUseCase } from '../../application/social/use-cases/get-meta-token-status.use-case.js'
import { GetTikTokTokenStatusUseCase } from '../../application/social/use-cases/get-tiktok-token-status.use-case.js'
import { LinkedInTokenService } from '../../application/social/services/linkedin-token.service.js'
import { GetLinkedInTokenStatusUseCase } from '../../application/social/use-cases/get-linkedin-token-status.use-case.js'
import { GetLinkedInAccountsUseCase } from '../../application/social/use-cases/get-linkedin-accounts.use-case.js'
import { PublishLinkedInUseCase } from '../../application/social/use-cases/publish-linkedin.use-case.js'
import { LinkedInExceptionMapper } from '../../application/social/services/linkedin-exception-mapper.js'
import { LinkedInImageUploader } from '../../infrastructure/social-providers/linkedin/linkedin-image-uploader.js'
import { LinkedInRestPostsService } from '../../infrastructure/social-providers/linkedin/linkedin-rest-posts.service.js'
import { LinkedInUgcPostsService } from '../../infrastructure/social-providers/linkedin/linkedin-ugc-posts.service.js'
import {
  DisabledLinkedInContentService,
  linkedinContentGatewayProvider,
} from '../../infrastructure/social-providers/linkedin/linkedin-content.factory.js'
import { YouTubeTokenService } from '../../application/social/services/youtube-token.service.js'
import { YouTubeExceptionMapper } from '../../application/social/services/youtube-exception-mapper.js'
import { GetYouTubeAccountsUseCase } from '../../application/social/use-cases/get-youtube-accounts.use-case.js'
import { GetYouTubeTokenStatusUseCase } from '../../application/social/use-cases/get-youtube-token-status.use-case.js'
import { PublishYouTubeUseCase } from '../../application/social/use-cases/publish-youtube.use-case.js'
import { ReconcileYouTubeVideosUseCase } from '../../application/social/use-cases/reconcile-youtube-videos.use-case.js'
import { YOUTUBE_PROCESSING_GATEWAY } from '../../application/social/ports/youtube-processing.gateway.js'
import { YouTubeProcessingService } from '../../infrastructure/social-providers/youtube/youtube-processing.service.js'
import { YouTubeProcessingScheduler } from '../../infrastructure/scheduling/youtube-processing.scheduler.js'
import {
  DisabledYouTubeContentService,
  youtubeContentGatewayProvider,
} from '../../infrastructure/social-providers/youtube/youtube-content.factory.js'
import { YouTubeContentService } from '../../infrastructure/social-providers/youtube/youtube-content.service.js'
import { YouTubeResumableUploader } from '../../infrastructure/social-providers/youtube/youtube-resumable-uploader.js'
import { MediaModule } from '../media/media.module.js'
import { PersistenceModule } from '../../infrastructure/prisma/persistence.module.js'
import { AuthModule } from '../auth/auth.module.js'

/// Endpoints de test/diagnostic Meta. Réutilise SOCIAL_ACCOUNT_REPOSITORY
/// (PersistenceModule) ; HttpModule fournit HttpService pour les appels Graph.
/// N'altère pas l'OAuth existant (AuthModule reste inchangé).
@Module({
  // AuthModule fournit YOUTUBE_TOKEN_GATEWAY (instance unique de
  // YouTubeOAuthService) — aucune dépendance circulaire : AuthModule n'importe
  // pas SocialModule.
  // MediaModule fournit MEDIA_READER_GATEWAY (lecture par plages), consommé par
  // l'upload résumable. Aucune dépendance circulaire : MediaModule n'importe
  // pas SocialModule.
  imports: [HttpModule, PersistenceModule, AuthModule, MediaModule],
  controllers: [SocialController, LinkedInController, YouTubeController],
  providers: [
    { provide: META_GRAPH_GATEWAY, useClass: MetaGraphService },
    // TikTok : passerelle Content Posting (publication) + passerelle OAuth
    // (rafraîchissement du token, réutilisée par TikTokTokenService).
    { provide: TIKTOK_CONTENT_GATEWAY, useClass: TikTokContentService },
    { provide: TIKTOK_OAUTH_GATEWAY, useClass: TikTokOAuthService },
    // Transfert binaire FILE_UPLOAD, dépendance de TikTokContentService.
    TikTokFileUploader,
    PublishFacebookTestPostUseCase,
    GetFacebookPagesUseCase,
    GetInstagramAccountsUseCase,
    GetConnectedAccountsUseCase,
    DebugTokenUseCase,
    GetFacebookProfileUseCase,
    PublishInstagramTestPostUseCase,
    PublishFacebookUseCase,
    PublishInstagramUseCase,
    PublishTikTokUseCase,
    PublishSocialUseCase,
    PublicationRecorder,
    MetaExceptionMapper,
    TikTokExceptionMapper,
    MetaTokenService,
    TikTokTokenService,
    GetMetaTokenStatusUseCase,
    GetTikTokTokenStatusUseCase,
    LinkedInTokenService,
    GetLinkedInTokenStatusUseCase,
    GetLinkedInAccountsUseCase,
    // LinkedIn — publication (profil membre). Deux adaptateurs derrière un port
    // unique ; la factory sélectionne rest/ugc/disabled selon LINKEDIN_PUBLISH_API.
    PublishLinkedInUseCase,
    LinkedInExceptionMapper,
    LinkedInImageUploader,
    LinkedInRestPostsService,
    LinkedInUgcPostsService,
    DisabledLinkedInContentService,
    linkedinContentGatewayProvider,
    // YouTube — token, lectures et publication. La factory choisit l'adaptateur
    // réel (upload résumable) ou l'adaptateur désactivé selon les credentials et
    // le feature flag ; les deux sont déclarés, un seul est injecté sur le port.
    YouTubeTokenService,
    YouTubeExceptionMapper,
    GetYouTubeAccountsUseCase,
    GetYouTubeTokenStatusUseCase,
    PublishYouTubeUseCase,
    YouTubeResumableUploader,
    YouTubeContentService,
    DisabledYouTubeContentService,
    youtubeContentGatewayProvider,
    // Réconciliation du traitement. Déclarée ICI plutôt que dans un module de
    // scheduling dédié : le use case réutilise l'unique YouTubeTokenService et
    // les repositories déjà présents dans ce module. Un module séparé devrait
    // soit importer SocialModule (dépendance croisée inutile), soit redéclarer
    // le token service — et casser le single-flight en créant une 2e instance.
    // Le port de statut est INDÉPENDANT du feature flag de publication : une
    // vidéo déjà envoyée doit pouvoir terminer son cycle.
    YouTubeProcessingService,
    { provide: YOUTUBE_PROCESSING_GATEWAY, useExisting: YouTubeProcessingService },
    ReconcileYouTubeVideosUseCase,
    YouTubeProcessingScheduler,
  ],
  // Exporté pour le scheduler (ScheduledPostModule) : la publication différée
  // réutilise l'orchestrateur multi-réseaux sans dupliquer sa logique.
  exports: [PublishSocialUseCase],
})
export class SocialModule {}
