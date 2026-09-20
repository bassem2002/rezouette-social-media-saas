import { Controller, Get, Inject, Query, Res } from '@nestjs/common'
import {
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger'
import { randomBytes } from 'node:crypto'
import type { Response } from 'express'
import { YOUTUBE_OAUTH_GATEWAY } from '../../application/auth/ports/youtube-oauth.gateway.js'
import type { YouTubeOAuthGateway } from '../../application/auth/ports/youtube-oauth.gateway.js'
import { ConnectYouTubeAccountUseCase } from '../../application/auth/use-cases/connect-youtube-account.use-case.js'
import { OAuthStateSigner } from '../../infrastructure/auth/oauth-state.signer.js'
import { OAuthNonceStore } from '../../infrastructure/auth/oauth-nonce.store.js'
import { OAuthPkceService } from '../../infrastructure/auth/oauth-pkce.service.js'
import { OAuthPkceStore } from '../../infrastructure/auth/oauth-pkce.store.js'
import {
  OAuthErrorCode,
  oauthBadRequest,
} from '../../infrastructure/auth/oauth-error.js'
import { OAuthFrontendRedirectService } from '../../infrastructure/auth/oauth-frontend-redirect.service.js'

/// Endpoints OAuth YouTube (Google). Ne touche jamais Prisma : dépend de la
/// passerelle (URL + échange), du use case (persistance), du signer de `state`
/// (HMAC), du store de `nonce` (usage unique) et du store PKCE (code_verifier
/// gardé côté serveur). Renvoie une 503 tant que YouTube n'est pas configuré.
///
/// ⚠️ Google n'est PAS utilisé ici comme fournisseur d'identité Zernio : aucun
/// scope openid/email/profile n'est demandé, aucun id_token n'est exploité.
/// L'identité persistée est celle de la CHAÎNE, lue via YouTube Data API.
@ApiTags('Auth YouTube (OAuth)')
@Controller('auth/youtube')
export class YouTubeAuthController {
  constructor(
    @Inject(YOUTUBE_OAUTH_GATEWAY)
    private readonly youtubeOAuth: YouTubeOAuthGateway,
    private readonly connectYouTubeAccount: ConnectYouTubeAccountUseCase,
    private readonly stateSigner: OAuthStateSigner,
    private readonly nonceStore: OAuthNonceStore,
    private readonly pkce: OAuthPkceService,
    private readonly pkceStore: OAuthPkceStore,
    private readonly redirect: OAuthFrontendRedirectService,
  ) {}

  /// GET /api/v1/auth/youtube?userId=<uuid> → redirige vers le consentement
  /// Google. Émet un `nonce` à usage unique, un couple PKCE dont le verifier
  /// reste côté serveur, et un `state` signé HMAC portant provider='youtube'.
  @Get()
  @ApiOperation({
    summary: 'Démarrer le flux OAuth YouTube (redirige vers Google)',
  })
  @ApiQuery({
    name: 'userId',
    format: 'uuid',
    example: '00000000-0000-0000-0000-000000000001',
    description: 'Stand-in de l’utilisateur authentifié (tant que JWT absent)',
  })
  @ApiServiceUnavailableResponse({
    description: 'YouTube integration is not configured.',
  })
  redirectToYouTube(
    @Query('userId') userId: string | undefined,
    @Res() res: Response,
  ): void {
    // 503 explicite AVANT toute crypto et tout appel réseau.
    this.youtubeOAuth.assertConfigured()
    this.stateSigner.assertConfigured()

    if (!userId) {
      throw oauthBadRequest(
        OAuthErrorCode.MISSING_OAUTH_PARAMETERS,
        'Le paramètre userId est requis (JWT non encore implémenté).',
      )
    }

    const nonce = randomBytes(16).toString('base64url')
    const challenge = this.pkce.generate()
    this.nonceStore.issue(nonce)
    this.pkceStore.issue(nonce, challenge.codeVerifier)

    let url: string
    try {
      const state = this.stateSigner.sign({ userId, nonce, provider: 'youtube' })
      url = this.youtubeOAuth.buildAuthorizationUrl({
        state,
        codeChallenge: challenge.codeChallenge,
      })
    } catch (err) {
      // Nettoyage : ne pas laisser traîner un nonce et un verifier inutilisables.
      this.nonceStore.consume(nonce)
      this.pkceStore.discard(nonce)
      throw err
    }

    res.redirect(url)
  }

  /// GET /api/v1/auth/youtube/callback → vérifie le state (provider='youtube'),
  /// consomme le nonce, récupère le code_verifier côté serveur, échange le code
  /// et persiste les chaînes. Aucun échange de token n'est tenté tant que ces
  /// contrôles ne sont pas tous passés.
  @Get('callback')
  @ApiOperation({
    summary: 'Callback OAuth YouTube — échange le code et persiste les chaînes',
  })
  @ApiOkResponse({
    description: 'Chaînes YouTube connectées (ou erreur structurée de Google)',
  })
  @ApiServiceUnavailableResponse({
    description: 'YouTube integration is not configured.',
  })
  async handleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Query('error_description') errorDescription: string | undefined,
    @Res({ passthrough: true }) res?: Response,
  ) {
    this.youtubeOAuth.assertConfigured()

    // Refus utilisateur ou erreur Google : aucun échange de code n'est tenté.
    if (error) {
      const redirect = this.redirect.buildErrorUrl({
        provider: 'youtube',
        errorCode: error,
      })
      if (redirect && res) {
        res.redirect(redirect)
        return
      }
      // Repli JSON quand le frontend n'est pas configuré : le callback ne doit
      // jamais échouer pour cette raison.
      return {
        success: false,
        provider: 'youtube',
        errorCode:
          error === 'access_denied' ? OAuthErrorCode.GOOGLE_ACCESS_DENIED : error,
        errorMessage: errorDescription ?? 'Autorisation YouTube échouée',
      }
    }

    if (!code || !state) {
      throw oauthBadRequest(
        OAuthErrorCode.MISSING_OAUTH_PARAMETERS,
        'Paramètres OAuth manquants (code/state).',
      )
    }

    // 1. Signature + fenêtre temporelle + provider attendu (un state LinkedIn
    //    présenté ici est refusé, même valablement signé).
    const payload = this.stateSigner.verify(state, 'youtube')

    // 2. Nonce à usage unique : rejette rejeu / nonce inconnu / expiré.
    if (!this.nonceStore.consume(payload.nonce)) {
      throw oauthBadRequest(
        OAuthErrorCode.INVALID_NONCE,
        'Nonce OAuth invalide, expiré ou déjà utilisé.',
      )
    }

    // 3. code_verifier PKCE (lecture destructive ; lève si absent ou expiré).
    const codeVerifier = this.pkceStore.consume(payload.nonce)

    const result = await this.connectYouTubeAccount.execute({
      userId: payload.userId,
      code,
      codeVerifier,
    })

    // Redirection UNIQUEMENT après validation du state, consommation du nonce
    // et du verifier PKCE, et persistance effective des chaînes.
    const redirect = this.redirect.buildSuccessUrl({
      provider: 'youtube',
      count: result.count,
    })
    if (redirect && res) {
      res.redirect(redirect)
      return
    }

    return {
      success: true,
      message: 'Chaîne(s) YouTube connectée(s) avec succès',
      userId: payload.userId,
      connected: { youtubeChannels: result.channels },
      count: result.count,
    }
  }
}
