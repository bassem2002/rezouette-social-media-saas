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
  ApiTags,
} from '@nestjs/swagger'
import { createHash, randomBytes } from 'node:crypto'
import type { Response } from 'express'
import { TIKTOK_OAUTH_GATEWAY } from '../../application/auth/ports/tiktok-oauth.gateway.js'
import type { TikTokOAuthGateway } from '../../application/auth/ports/tiktok-oauth.gateway.js'
import { ConnectTikTokAccountUseCase } from '../../application/auth/use-cases/connect-tiktok-account.use-case.js'
import { OAuthFrontendRedirectService } from '../../infrastructure/auth/oauth-frontend-redirect.service.js'

/// Payload transporté par le `state` OAuth. En l'absence de session serveur
/// (MVP sans JWT), le `code_verifier` PKCE y transite pour être retrouvé au
/// callback. Le `nonce` sert de protection CSRF.
interface TikTokOAuthState {
  userId: string
  nonce: string
  /// code_verifier PKCE.
  cv: string
}

/// Endpoints OAuth TikTok. Ne touche jamais Prisma : dépend de la passerelle
/// (URL) et du use case (callback), tous deux des abstractions.
@ApiTags('Auth TikTok (OAuth)')
@Controller('auth/tiktok')
export class TikTokAuthController {
  constructor(
    @Inject(TIKTOK_OAUTH_GATEWAY)
    private readonly tiktokOAuth: TikTokOAuthGateway,
    private readonly connectTikTokAccount: ConnectTikTokAccountUseCase,
    private readonly redirect: OAuthFrontendRedirectService,
  ) {}

  /// GET /api/v1/auth/tiktok?userId=<uuid> → redirige vers TikTok Login.
  /// Génère un couple PKCE (code_verifier/code_challenge) ; le verifier est
  /// encodé dans le `state` (pas de session serveur au stade MVP).
  @Get()
  @ApiOperation({
    summary: 'Démarrer le flux OAuth TikTok (redirige vers TikTok Login)',
  })
  @ApiQuery({
    name: 'userId',
    format: 'uuid',
    example: '00000000-0000-0000-0000-000000000001',
    description: 'Stand-in de l’utilisateur authentifié (tant que JWT absent)',
  })
  redirectToTikTok(
    @Query('userId') userId: string | undefined,
    @Res() res: Response,
  ): void {
    if (!userId) {
      throw new BadRequestException(
        'Le paramètre userId est requis (JWT non encore implémenté).',
      )
    }
    const codeVerifier = this.generateCodeVerifier()
    const codeChallenge = this.deriveCodeChallenge(codeVerifier)
    const state = this.encodeState(userId, codeVerifier)
    const url = this.tiktokOAuth.buildAuthorizationUrl(state, codeChallenge)
    res.redirect(url)
  }

  /// GET /api/v1/auth/tiktok/callback → échange le code et persiste le compte.
  @Get('callback')
  @ApiOperation({
    summary: 'Callback OAuth TikTok — échange le code et persiste le compte',
  })
  @ApiOkResponse({
    description: 'Compte TikTok connecté (ou erreur structurée renvoyée par TikTok)',
  })
  async handleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Query('error_description') errorDescription: string | undefined,
    @Res({ passthrough: true }) res?: Response,
  ) {
    if (error) {
      const redirect = this.redirect.buildErrorUrl({
        provider: 'tiktok',
        errorCode: error,
      })
      if (redirect && res) {
        res.redirect(redirect)
        return
      }
      return {
        success: false,
        provider: 'tiktok',
        errorCode: error,
        errorMessage: errorDescription ?? 'Autorisation TikTok échouée',
      }
    }

    if (!code || !state) {
      throw new BadRequestException('Paramètres OAuth manquants (code/state).')
    }

    const { userId, cv } = this.decodeState(state)
    const result = await this.connectTikTokAccount.execute({
      userId,
      code,
      codeVerifier: cv,
    })

    const redirect = this.redirect.buildSuccessUrl({
      provider: 'tiktok',
      count: result.count,
    })
    if (redirect && res) {
      res.redirect(redirect)
      return
    }

    return {
      success: true,
      message: 'Compte TikTok connecté avec succès',
      userId,
      connected: { tiktokAccount: result.account },
      count: result.count,
    }
  }

  /// PKCE : code_verifier = 32 octets aléatoires encodés base64url (43 chars,
  /// dans l'ensemble non réservé autorisé par la RFC 7636).
  private generateCodeVerifier(): string {
    return randomBytes(32).toString('base64url')
  }

  /// PKCE : code_challenge = base64url( SHA-256(code_verifier) ).
  private deriveCodeChallenge(codeVerifier: string): string {
    return createHash('sha256').update(codeVerifier).digest('base64url')
  }

  private encodeState(userId: string, codeVerifier: string): string {
    const payload: TikTokOAuthState = {
      userId,
      nonce: randomBytes(8).toString('hex'),
      cv: codeVerifier,
    }
    return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  }

  private decodeState(state: string): TikTokOAuthState {
    try {
      const decoded = JSON.parse(
        Buffer.from(state, 'base64url').toString('utf8'),
      ) as Partial<TikTokOAuthState>
      if (!decoded.userId || !decoded.cv) {
        throw new Error('state TikTok incomplet')
      }
      return {
        userId: decoded.userId,
        nonce: decoded.nonce ?? '',
        cv: decoded.cv,
      }
    } catch {
      throw new BadRequestException('State OAuth invalide.')
    }
  }
}
