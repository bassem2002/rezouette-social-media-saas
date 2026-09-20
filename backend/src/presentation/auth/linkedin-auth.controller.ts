import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Query,
  Res,
} from '@nestjs/common'
import {
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger'
import { randomBytes } from 'node:crypto'
import type { Response } from 'express'
import { LINKEDIN_OAUTH_GATEWAY } from '../../application/auth/ports/linkedin-oauth.gateway.js'
import type { LinkedInOAuthGateway } from '../../application/auth/ports/linkedin-oauth.gateway.js'
import { ConnectLinkedInAccountUseCase } from '../../application/auth/use-cases/connect-linkedin-account.use-case.js'
import { OAuthStateSigner } from '../../infrastructure/auth/oauth-state.signer.js'
import { OAuthNonceStore } from '../../infrastructure/auth/oauth-nonce.store.js'
import { OAuthFrontendRedirectService } from '../../infrastructure/auth/oauth-frontend-redirect.service.js'

/// Endpoints OAuth/OIDC LinkedIn (profil membre). Ne touche jamais Prisma : dépend
/// de la passerelle (URL + échange), du use case (persistance), du signer de `state`
/// (HMAC) et du store de `nonce` (usage unique). Renvoie une 503 claire tant que
/// LinkedIn n'est pas configuré.
@ApiTags('Auth LinkedIn (OAuth/OIDC)')
@Controller('auth/linkedin')
export class LinkedInAuthController {
  constructor(
    @Inject(LINKEDIN_OAUTH_GATEWAY)
    private readonly linkedinOAuth: LinkedInOAuthGateway,
    private readonly connectLinkedInAccount: ConnectLinkedInAccountUseCase,
    private readonly stateSigner: OAuthStateSigner,
    private readonly nonceStore: OAuthNonceStore,
    private readonly redirect: OAuthFrontendRedirectService,
  ) {}

  /// GET /api/v1/auth/linkedin?userId=<uuid> → redirige vers LinkedIn Login.
  /// Génère un `nonce` à usage unique (stocké) et un `state` signé HMAC qui le porte.
  @Get()
  @ApiOperation({
    summary: 'Démarrer le flux OAuth LinkedIn (redirige vers LinkedIn Login)',
  })
  @ApiQuery({
    name: 'userId',
    format: 'uuid',
    example: '00000000-0000-0000-0000-000000000001',
    description: 'Stand-in de l’utilisateur authentifié (tant que JWT absent)',
  })
  @ApiServiceUnavailableResponse({
    description: 'LinkedIn integration is not configured.',
  })
  redirectToLinkedIn(
    @Query('userId') userId: string | undefined,
    @Res() res: Response,
  ): void {
    if (!userId) {
      throw new BadRequestException(
        'Le paramètre userId est requis (JWT non encore implémenté).',
      )
    }
    // 503 explicite AVANT toute crypto si LinkedIn n'est pas configuré.
    this.linkedinOAuth.assertConfigured()

    const nonce = randomBytes(16).toString('base64url')
    this.nonceStore.issue(nonce)
    // Le provider fait partie de la charge signée : ce state ne pourra pas être
    // rejoué sur le callback d'un autre réseau (YouTube notamment).
    const state = this.stateSigner.sign({ userId, nonce, provider: 'linkedin' })
    const url = this.linkedinOAuth.buildAuthorizationUrl(state, nonce)
    res.redirect(url)
  }

  /// GET /api/v1/auth/linkedin/callback → valide le state, consomme le nonce,
  /// échange le code (OIDC validé côté infra) et persiste le compte membre.
  @Get('callback')
  @ApiOperation({
    summary: 'Callback OAuth LinkedIn — échange le code et persiste le compte membre',
  })
  @ApiOkResponse({
    description: 'Compte LinkedIn connecté (ou erreur structurée renvoyée par LinkedIn)',
  })
  @ApiServiceUnavailableResponse({
    description: 'LinkedIn integration is not configured.',
  })
  async handleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Query('error_description') errorDescription: string | undefined,
    @Res({ passthrough: true }) res?: Response,
  ) {
    this.linkedinOAuth.assertConfigured()

    if (error) {
      // Convention commune : retour vers l'UI, ou repli JSON si le frontend
      // n'est pas configuré. La logique OAuth elle-même est inchangée.
      const redirect = this.redirect.buildErrorUrl({
        provider: 'linkedin',
        errorCode: error,
      })
      if (redirect && res) {
        res.redirect(redirect)
        return
      }
      return {
        success: false,
        provider: 'linkedin',
        errorCode: error,
        errorMessage: errorDescription ?? 'Autorisation LinkedIn échouée',
      }
    }

    if (!code || !state) {
      throw new BadRequestException('Paramètres OAuth manquants (code/state).')
    }

    // Vérifie signature + expiration + provider attendu (lève BadRequest sinon).
    const payload = this.stateSigner.verify(state, 'linkedin')
    // Nonce à usage unique : rejette rejeu / nonce inconnu / expiré.
    if (!this.nonceStore.consume(payload.nonce)) {
      throw new BadRequestException('Nonce OAuth invalide ou déjà utilisé.')
    }

    const result = await this.connectLinkedInAccount.execute({
      userId: payload.userId,
      code,
      expectedNonce: payload.nonce,
    })

    const redirect = this.redirect.buildSuccessUrl({
      provider: 'linkedin',
      count: result.count,
    })
    if (redirect && res) {
      res.redirect(redirect)
      return
    }

    return {
      success: true,
      message: 'Compte LinkedIn connecté avec succès',
      userId: payload.userId,
      connected: { linkedinAccount: result.account },
      count: result.count,
    }
  }
}
