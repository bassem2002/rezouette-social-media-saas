import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger'
import { ParseUuidShapePipe } from './pipes/parse-uuid-shape.pipe.js'
import {
  LinkedInConfig,
  isLinkedInConfigured,
} from '../../config/linkedin.config.js'
import { GetLinkedInTokenStatusUseCase } from '../../application/social/use-cases/get-linkedin-token-status.use-case.js'
import { GetLinkedInAccountsUseCase } from '../../application/social/use-cases/get-linkedin-accounts.use-case.js'
import { PublishLinkedInUseCase } from '../../application/social/use-cases/publish-linkedin.use-case.js'
import type { PublicationOutcome } from '../../application/social-post/services/publication-recorder.js'
import { LinkedInTokenStatusDto } from './dto/linkedin-token-status.dto.js'
import { PublishLinkedInDto } from './dto/publish-linkedin.dto.js'
import { LinkedInPublishResponseDto } from './dto/linkedin-publish-response.dto.js'
import { ConnectedAccountDto } from './dto/social-responses.dto.js'

/// Endpoints de lecture LinkedIn (statut du token, comptes). Couche présentation
/// pure : délègue aux use cases, ne touche ni Prisma ni LinkedIn directement.
/// Renvoie une 503 claire tant que LinkedIn n'est pas configuré — c'est ce signal
/// que l'UI Angular utilise pour désactiver le bouton Connect.
@ApiTags('Social — LinkedIn (membre)')
@Controller('social/linkedin')
export class LinkedInController {
  constructor(
    private readonly config: ConfigService,
    private readonly getLinkedInTokenStatus: GetLinkedInTokenStatusUseCase,
    private readonly getLinkedInAccounts: GetLinkedInAccountsUseCase,
    private readonly publishLinkedIn: PublishLinkedInUseCase,
  ) {}

  /// Garde de configuration : 503 explicite si LinkedIn n'est pas configuré.
  private assertConfigured(): void {
    const linkedin = this.config.getOrThrow<LinkedInConfig>('linkedin')
    if (!isLinkedInConfigured(linkedin)) {
      throw new ServiceUnavailableException(
        'LinkedIn integration is not configured.',
      )
    }
  }

  /// Garde de publication : 503 si la publication n'est pas activée
  /// (LINKEDIN_PUBLISH_API=disabled). Aucun appel réseau n'est tenté.
  private assertPublishable(): void {
    this.assertConfigured()
    const linkedin = this.config.getOrThrow<LinkedInConfig>('linkedin')
    if (linkedin.publishApi === 'disabled') {
      throw new ServiceUnavailableException(
        'LinkedIn publishing is not configured (LINKEDIN_PUBLISH_API=disabled).',
      )
    }
  }

  @Get('token-status')
  @ApiOperation({
    summary: 'Statut du cycle de vie du token LinkedIn du user (membre)',
    description:
      'Dérive VALID / EXPIRING_SOON / EXPIRED / RECONNECT_REQUIRED à partir de l’expiration de l’access token (~60 j) et du drapeau de reconnexion. Aucun refresh (app standard) : le renouvellement passe par un nouveau flux OAuth. Renvoie 503 si LinkedIn n’est pas configuré.',
  })
  @ApiQuery({
    name: 'userId',
    format: 'uuid',
    example: '00000000-0000-0000-0000-000000000001',
  })
  @ApiOkResponse({ type: LinkedInTokenStatusDto })
  @ApiServiceUnavailableResponse({
    description: 'LinkedIn integration is not configured.',
  })
  @ApiNotFoundResponse({
    description: 'Aucun compte LinkedIn connecté pour cet utilisateur.',
  })
  async tokenStatus(
    @Query('userId', new ParseUuidShapePipe()) userId: string,
  ): Promise<LinkedInTokenStatusDto> {
    this.assertConfigured()
    const result = await this.getLinkedInTokenStatus.execute(userId)
    return {
      status: result.status,
      accountName: result.accountName,
      expiresAt: result.expiresAt ? result.expiresAt.toISOString() : null,
      needsReconnect: result.needsReconnect,
    }
  }

  @Get('accounts')
  @ApiOperation({
    summary: 'Lister les comptes LinkedIn persistés du user (sans tokens)',
  })
  @ApiQuery({
    name: 'userId',
    format: 'uuid',
    example: '00000000-0000-0000-0000-000000000001',
  })
  @ApiOkResponse({ type: [ConnectedAccountDto] })
  @ApiServiceUnavailableResponse({
    description: 'LinkedIn integration is not configured.',
  })
  async accounts(
    @Query('userId', new ParseUuidShapePipe()) userId: string,
  ): Promise<ConnectedAccountDto[]> {
    this.assertConfigured()
    return this.getLinkedInAccounts.execute(userId) as Promise<
      ConnectedAccountDto[]
    >
  }

  @Post('publish')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Publier sur le profil LinkedIn (membre) : texte, lien ou une image',
    description:
      'Publie sur le profil membre actif du user via l’adaptateur configuré (LINKEDIN_PUBLISH_API : rest ou ugc). Renvoie 503 si LinkedIn n’est pas configuré ou si la publication est désactivée (disabled). En cas d’échec métier (token, permission, média…), renvoie 201 avec success=false et une raison normalisée. Aucun champ organisation (reporté).',
  })
  @ApiCreatedResponse({ type: LinkedInPublishResponseDto })
  @ApiBadRequestResponse({ description: 'Corps invalide (validation).' })
  @ApiNotFoundResponse({
    description: 'Aucun compte LinkedIn actif connecté pour cet utilisateur.',
  })
  @ApiServiceUnavailableResponse({
    description:
      'LinkedIn non configuré, ou publication désactivée (LINKEDIN_PUBLISH_API=disabled).',
  })
  async publish(
    @Body() dto: PublishLinkedInDto,
  ): Promise<LinkedInPublishResponseDto> {
    this.assertPublishable()
    const outcome = await this.publishLinkedIn.execute({
      userId: dto.userId,
      text: dto.text,
      linkUrl: dto.linkUrl,
      linkTitle: dto.linkTitle,
      linkDescription: dto.linkDescription,
      imageUrl: dto.imageUrl,
      imageAltText: dto.imageAltText,
      visibility: dto.visibility,
    })
    return this.toResponse(outcome)
  }

  /// Projette un PublicationOutcome en réponse HTTP normalisée (succès/échec).
  private toResponse(outcome: PublicationOutcome): LinkedInPublishResponseDto {
    if (outcome.success) {
      return {
        success: true,
        platform: 'linkedin',
        externalPostId: outcome.externalPostId,
      }
    }
    return {
      success: false,
      platform: 'linkedin',
      error: outcome.message,
      reason: outcome.error.reason,
      retryable: outcome.error.retryable,
      action: outcome.error.action,
    }
  }
}
