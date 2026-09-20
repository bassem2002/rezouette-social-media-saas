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
import { randomBytes } from 'node:crypto'
import type { Response } from 'express'
import { META_OAUTH_GATEWAY } from '../../application/auth/ports/meta-oauth.gateway.js'
import type { MetaOAuthGateway } from '../../application/auth/ports/meta-oauth.gateway.js'
import { ConnectMetaAccountUseCase } from '../../application/auth/use-cases/connect-meta-account.use-case.js'

/// Endpoints OAuth Meta. Ne touche jamais Prisma : dépend de la passerelle
/// (URL) et du use case (callback), tous deux des abstractions.
@ApiTags('Auth Meta (OAuth)')
@Controller('auth/meta')
export class AuthController {
  constructor(
    @Inject(META_OAUTH_GATEWAY)
    private readonly metaOAuth: MetaOAuthGateway,
    private readonly connectMetaAccount: ConnectMetaAccountUseCase,
  ) {}

  /// GET /api/v1/auth/meta?userId=<uuid> → redirige vers Facebook Login.
  /// userId transite par le `state` (sert aussi de protection CSRF).
  /// Stand-in temporaire de l'utilisateur authentifié tant que JWT n'existe pas.
  @Get()
  @ApiOperation({
    summary: 'Démarrer le flux OAuth Meta (redirige vers Facebook Login)',
  })
  @ApiQuery({
    name: 'userId',
    format: 'uuid',
    example: '00000000-0000-0000-0000-000000000001',
    description: 'Stand-in de l’utilisateur authentifié (tant que JWT absent)',
  })
  redirectToMeta(
    @Query('userId') userId: string | undefined,
    @Res() res: Response,
  ): void {
    if (!userId) {
      throw new BadRequestException(
        'Le paramètre userId est requis (JWT non encore implémenté).',
      )
    }
    const state = this.encodeState(userId)
    const url = this.metaOAuth.buildAuthorizationUrl(state)
    res.redirect(url)
  }

  /// GET /api/v1/auth/meta/callback → échange le code et persiste les comptes.
  @Get('callback')
  @ApiOperation({
    summary: 'Callback OAuth Meta — échange le code et persiste les comptes',
  })
  @ApiOkResponse({
    description: 'Comptes Meta connectés (ou erreur structurée renvoyée par Meta)',
  })
  async handleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Query('error_reason') errorReason: string | undefined,
    @Query('error_description') errorDescription: string | undefined,
    @Query('error_code') errorCode: string | undefined,
    @Query('error_message') errorMessage: string | undefined,
  ) {
    // Meta peut renvoyer soit le format OAuth standard (error/error_description),
    // soit le format Graph (error_code/error_message). Dans tous ces cas on
    // renvoie une erreur structurée plutôt que "Paramètres OAuth manquants".
    const hasMetaError = Boolean(
      error || errorReason || errorCode || errorMessage,
    )
    if (hasMetaError) {
      return {
        success: false,
        provider: 'meta',
        errorCode: errorCode ?? error ?? errorReason ?? 'unknown',
        errorMessage:
          errorMessage ?? errorDescription ?? error ?? 'Autorisation Meta échouée',
      }
    }

    if (!code || !state) {
      throw new BadRequestException('Paramètres OAuth manquants (code/state).')
    }

    const userId = this.decodeState(state)
    const result = await this.connectMetaAccount.execute({ userId, code })

    return {
      success: true,
      message: 'Comptes Meta connectés avec succès',
      userId,
      connected: {
        facebookPages: result.facebookPages,
        instagramAccounts: result.instagramAccounts,
      },
      count: result.count,
    }
  }

  private encodeState(userId: string): string {
    const payload = { userId, nonce: randomBytes(8).toString('hex') }
    return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  }

  private decodeState(state: string): string {
    try {
      const decoded = JSON.parse(
        Buffer.from(state, 'base64url').toString('utf8'),
      ) as { userId?: string }
      if (!decoded.userId) {
        throw new Error('userId absent du state')
      }
      return decoded.userId
    } catch {
      throw new BadRequestException('State OAuth invalide.')
    }
  }
}
