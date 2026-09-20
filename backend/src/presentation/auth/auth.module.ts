import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { AuthController } from './auth.controller.js'
import { TikTokAuthController } from './tiktok-auth.controller.js'
import { LinkedInAuthController } from './linkedin-auth.controller.js'
import { YouTubeAuthController } from './youtube-auth.controller.js'
import { META_OAUTH_GATEWAY } from '../../application/auth/ports/meta-oauth.gateway.js'
import { TIKTOK_OAUTH_GATEWAY } from '../../application/auth/ports/tiktok-oauth.gateway.js'
import { LINKEDIN_OAUTH_GATEWAY } from '../../application/auth/ports/linkedin-oauth.gateway.js'
import { YOUTUBE_OAUTH_GATEWAY } from '../../application/auth/ports/youtube-oauth.gateway.js'
import { YOUTUBE_TOKEN_GATEWAY } from '../../application/auth/ports/youtube-token.gateway.js'
import { ConnectMetaAccountUseCase } from '../../application/auth/use-cases/connect-meta-account.use-case.js'
import { ConnectTikTokAccountUseCase } from '../../application/auth/use-cases/connect-tiktok-account.use-case.js'
import { ConnectLinkedInAccountUseCase } from '../../application/auth/use-cases/connect-linkedin-account.use-case.js'
import { ConnectYouTubeAccountUseCase } from '../../application/auth/use-cases/connect-youtube-account.use-case.js'
import { MetaOAuthService } from '../../infrastructure/social-providers/meta/meta-oauth.service.js'
import { TikTokOAuthService } from '../../infrastructure/social-providers/tiktok/tiktok-oauth.service.js'
import { LinkedInOAuthService } from '../../infrastructure/social-providers/linkedin/linkedin-oauth.service.js'
import { LinkedInOidcVerifier } from '../../infrastructure/social-providers/linkedin/linkedin-oidc.verifier.js'
import { YouTubeOAuthService } from '../../infrastructure/social-providers/youtube/youtube-oauth.service.js'
import { OAuthStateSigner } from '../../infrastructure/auth/oauth-state.signer.js'
import { OAuthNonceStore } from '../../infrastructure/auth/oauth-nonce.store.js'
import { OAuthPkceService } from '../../infrastructure/auth/oauth-pkce.service.js'
import { OAuthPkceStore } from '../../infrastructure/auth/oauth-pkce.store.js'
import { OAuthFrontendRedirectService } from '../../infrastructure/auth/oauth-frontend-redirect.service.js'
import { PersistenceModule } from '../../infrastructure/prisma/persistence.module.js'

/// Câble OAuth Meta + TikTok + LinkedIn + YouTube. PersistenceModule fournit
/// SOCIAL_ACCOUNT_REPOSITORY ; ConfigService vient du ConfigModule global ;
/// HttpModule fournit HttpService.
///
/// Les briques OAuth transverses — signer de `state` (HMAC, multi-providers),
/// store de `nonce` (usage unique) et store PKCE (code_verifier côté serveur) —
/// sont déclarées ICI et NULLE PART AILLEURS : leur état vit en mémoire, une
/// seconde instance dans un autre module casserait l'anti-rejeu.
@Module({
  imports: [HttpModule, PersistenceModule],
  controllers: [
    AuthController,
    TikTokAuthController,
    LinkedInAuthController,
    YouTubeAuthController,
  ],
  providers: [
    ConnectMetaAccountUseCase,
    { provide: META_OAUTH_GATEWAY, useClass: MetaOAuthService },
    ConnectTikTokAccountUseCase,
    { provide: TIKTOK_OAUTH_GATEWAY, useClass: TikTokOAuthService },
    ConnectLinkedInAccountUseCase,
    { provide: LINKEDIN_OAUTH_GATEWAY, useClass: LinkedInOAuthService },
    LinkedInOidcVerifier,
    ConnectYouTubeAccountUseCase,
    // Une SEULE instance de YouTubeOAuthService, exposée derrière ses deux ports
    // (`useExisting`) : le token endpoint Google est unique, son client aussi.
    YouTubeOAuthService,
    { provide: YOUTUBE_OAUTH_GATEWAY, useExisting: YouTubeOAuthService },
    { provide: YOUTUBE_TOKEN_GATEWAY, useExisting: YouTubeOAuthService },
    OAuthStateSigner,
    OAuthNonceStore,
    OAuthPkceService,
    OAuthPkceStore,
    // Convention de retour vers le frontend, PARTAGÉE par les trois providers :
    // un seul endroit construit ces URL, aucun callback n'invente ses paramètres.
    OAuthFrontendRedirectService,
  ],
  // Le refresh de token est consommé par SocialModule (YouTubeTokenService), qui
  // réutilise ainsi l'instance déclarée ici plutôt que d'en créer une seconde.
  exports: [YOUTUBE_TOKEN_GATEWAY],
})
export class AuthModule {}
