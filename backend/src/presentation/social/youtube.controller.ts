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
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger'
import { ParseUuidShapePipe } from './pipes/parse-uuid-shape.pipe.js'
import {
  isYouTubeConfigured,
  isYouTubePublishingEnabled,
  type YouTubeConfig,
} from '../../config/youtube.config.js'
import { GetYouTubeAccountsUseCase } from '../../application/social/use-cases/get-youtube-accounts.use-case.js'
import { GetYouTubeTokenStatusUseCase } from '../../application/social/use-cases/get-youtube-token-status.use-case.js'
import { PublishYouTubeUseCase } from '../../application/social/use-cases/publish-youtube.use-case.js'
import type { YouTubePublicationOutcome } from '../../application/social/use-cases/publish-youtube.use-case.js'
import { YouTubeAccountResponseDto } from './dto/youtube-account-response.dto.js'
import { YouTubeTokenStatusResponseDto } from './dto/youtube-token-status-response.dto.js'
import { PublishYouTubeDto } from './dto/publish-youtube.dto.js'
import { YouTubePublishResponseDto } from './dto/youtube-publish-response.dto.js'

/// Endpoints de LECTURE YouTube (chaînes connectées, statut des tokens). Couche
/// présentation pure : délègue aux use cases, ne touche ni Prisma ni Google.
/// Renvoie une 503 claire tant que YouTube n'est pas configuré — c'est ce signal
/// que l'UI utilisera pour désactiver la connexion.
///
@ApiTags('Social — YouTube')
@Controller('social/youtube')
export class YouTubeController {
  constructor(
    private readonly config: ConfigService,
    private readonly getYouTubeAccounts: GetYouTubeAccountsUseCase,
    private readonly getYouTubeTokenStatus: GetYouTubeTokenStatusUseCase,
    private readonly publishYouTube: PublishYouTubeUseCase,
  ) {}

  /// Garde de configuration : 503 explicite si YouTube n'est pas configuré.
  private assertConfigured(): void {
    const youtube = this.config.getOrThrow<YouTubeConfig>('youtube')
    if (!isYouTubeConfigured(youtube)) {
      throw new ServiceUnavailableException(
        'YouTube integration is not configured.',
      )
    }
  }

  /// Garde de publication : 503 si le feature flag est baissé. Rien n'est écrit,
  /// aucun token n'est rafraîchi, aucun gateway n'est atteint.
  private assertPublishable(): void {
    this.assertConfigured()
    const youtube = this.config.getOrThrow<YouTubeConfig>('youtube')
    if (!isYouTubePublishingEnabled(youtube)) {
      throw new ServiceUnavailableException(
        'YouTube publishing is not configured (YOUTUBE_PUBLISHING_ENABLED=false).',
      )
    }
  }

  @Get('accounts')
  @ApiOperation({
    summary: 'Lister les chaînes YouTube connectées du user (sans tokens)',
    description:
      'Lecture locale : aucun appel à Google. Un compte Google peut exposer plusieurs chaînes — la réponse est donc une liste, éventuellement vide.',
  })
  @ApiQuery({
    name: 'userId',
    format: 'uuid',
    example: '00000000-0000-0000-0000-000000000001',
  })
  @ApiOkResponse({ type: [YouTubeAccountResponseDto] })
  @ApiBadRequestResponse({ description: 'userId manquant ou mal formé.' })
  @ApiServiceUnavailableResponse({
    description: 'YouTube integration is not configured.',
  })
  async accounts(
    @Query('userId', new ParseUuidShapePipe()) userId: string,
  ): Promise<YouTubeAccountResponseDto[]> {
    this.assertConfigured()
    return this.getYouTubeAccounts.execute(userId) as Promise<
      YouTubeAccountResponseDto[]
    >
  }

  @Get('token-status')
  @ApiOperation({
    summary: 'Statut du cycle de vie des tokens YouTube (une entrée par chaîne)',
    description:
      "Dérive VALID / EXPIRING_SOON / EXPIRED / RECONNECT_REQUIRED depuis l'expiration de l'access token (~1 h), la présence d'un refresh token et le drapeau de reconnexion. Lecture PASSIVE : aucun rafraîchissement, aucun appel réseau. Une liste vide signifie « aucune chaîne connectée ».",
  })
  @ApiQuery({
    name: 'userId',
    format: 'uuid',
    example: '00000000-0000-0000-0000-000000000001',
  })
  @ApiOkResponse({ type: YouTubeTokenStatusResponseDto })
  @ApiBadRequestResponse({ description: 'userId manquant ou mal formé.' })
  @ApiServiceUnavailableResponse({
    description: 'YouTube integration is not configured.',
  })
  async tokenStatus(
    @Query('userId', new ParseUuidShapePipe()) userId: string,
  ): Promise<YouTubeTokenStatusResponseDto> {
    this.assertConfigured()
    const result = await this.getYouTubeTokenStatus.execute(userId)
    return {
      accounts: result.accounts.map((a) => ({
        accountId: a.accountId,
        channelId: a.channelId,
        accountName: a.accountName,
        status: a.status,
        expiresAt: a.expiresAt ? a.expiresAt.toISOString() : null,
        needsReconnect: a.needsReconnect,
        hasRefreshToken: a.hasRefreshToken,
      })),
    }
  }

  @Post('publish')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Publier une vidéo sur une chaîne YouTube',
    description:
      "Publie la vidéo désignée par `videoUrl` sur la chaîne `accountId`. " +
      "Renvoie 503 si YouTube n'est pas configuré ou si la publication est désactivée (YOUTUBE_PUBLISHING_ENABLED=false). " +
      "Avec le flag baissé, l'adaptateur désactivé rejette localement en PUBLISHING_NOT_CONFIGURED, sans aucun appel à Google ; le flag est lu AU DÉMARRAGE, un changement exige un redémarrage. " +
      "Un succès avec `processing: true` signifie que YouTube a accepté la vidéo mais l'encode encore : elle n'est PAS publiée, et l'historique reste PENDING. " +
      "Un échec métier (token, scope, quota…) renvoie 201 avec success=false et un diagnostic normalisé.",
  })
  @ApiCreatedResponse({ type: YouTubePublishResponseDto })
  @ApiBadRequestResponse({
    description:
      'Corps invalide : UUID mal formé, titre absent ou trop long, booléen non strict.',
  })
  @ApiServiceUnavailableResponse({
    description:
      'YouTube non configuré, ou publication désactivée (YOUTUBE_PUBLISHING_ENABLED=false).',
  })
  async publish(
    @Body() dto: PublishYouTubeDto,
  ): Promise<YouTubePublishResponseDto> {
    this.assertPublishable()
    const outcome = await this.publishYouTube.execute({
      userId: dto.userId,
      accountId: dto.accountId,
      videoUrl: dto.videoUrl,
      title: dto.title,
      madeForKids: dto.madeForKids,
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
      ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
      ...(dto.privacyStatus !== undefined
        ? { privacyStatus: dto.privacyStatus }
        : {}),
      ...(dto.containsSyntheticMedia !== undefined
        ? { containsSyntheticMedia: dto.containsSyntheticMedia }
        : {}),
      ...(dto.notifySubscribers !== undefined
        ? { notifySubscribers: dto.notifySubscribers }
        : {}),
    })
    return this.toResponse(outcome)
  }

  /// Projette le résultat du use case en réponse HTTP. Aucun token, aucune
  /// donnée sensible : uniquement l'état de publication et le diagnostic.
  private toResponse(
    outcome: YouTubePublicationOutcome,
  ): YouTubePublishResponseDto {
    if (outcome.success) {
      return {
        success: true,
        platform: 'youtube',
        processing: outcome.processing,
        publishId: outcome.publishId,
        externalPostId: outcome.externalPostId,
      }
    }
    return {
      success: false,
      platform: 'youtube',
      error: outcome.message,
      reason: outcome.error.reason,
      retryable: outcome.error.retryable,
      action: outcome.error.action,
    }
  }
}
