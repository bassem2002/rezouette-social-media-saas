import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common'
import { ParseUuidShapePipe } from './pipes/parse-uuid-shape.pipe.js'
import {
  ApiBadRequestResponse,
  ApiBadGatewayResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger'
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
import { GetMetaTokenStatusUseCase } from '../../application/social/use-cases/get-meta-token-status.use-case.js'
import { GetTikTokTokenStatusUseCase } from '../../application/social/use-cases/get-tiktok-token-status.use-case.js'
import type { PublicationOutcome } from '../../application/social-post/services/publication-recorder.js'
import { FacebookTestPostDto } from './dto/facebook-test-post.dto.js'
import { InstagramTestPostDto } from './dto/instagram-test-post.dto.js'
import { PublishFacebookDto } from './dto/publish-facebook.dto.js'
import { PublishInstagramDto } from './dto/publish-instagram.dto.js'
import { PublishTikTokDto } from './dto/publish-tiktok.dto.js'
import { PublishResponseDto } from './dto/publish-response.dto.js'
import { PublishSocialDto } from './dto/publish-social.dto.js'
import { PublishSocialResponseDto } from './dto/publish-social-response.dto.js'
import { TokenStatusDto } from './dto/token-status.dto.js'
import { TikTokTokenStatusDto } from './dto/tiktok-token-status.dto.js'
import {
  ConnectedAccountDto,
  FacebookPageDto,
  FacebookProfileResponseDto,
  FacebookTestPostResponseDto,
  InstagramAccountDto,
  InstagramTestPostResponseDto,
  TokenDebugResponseDto,
} from './dto/social-responses.dto.js'

/// Endpoints de test/diagnostic de l'intégration Meta. Couche présentation pure :
/// délègue à des use cases, ne touche ni Prisma ni Graph directement.
@ApiTags('Social — Meta (test & debug)')
@Controller('social')
export class SocialController {
  constructor(
    private readonly publishFacebookTestPost: PublishFacebookTestPostUseCase,
    private readonly getFacebookPages: GetFacebookPagesUseCase,
    private readonly getInstagramAccounts: GetInstagramAccountsUseCase,
    private readonly getConnectedAccounts: GetConnectedAccountsUseCase,
    private readonly debugToken: DebugTokenUseCase,
    private readonly getFacebookProfile: GetFacebookProfileUseCase,
    private readonly publishInstagramTestPost: PublishInstagramTestPostUseCase,
    private readonly publishFacebook: PublishFacebookUseCase,
    private readonly publishInstagram: PublishInstagramUseCase,
    private readonly publishTikTok: PublishTikTokUseCase,
    private readonly publishSocial: PublishSocialUseCase,
    private readonly getMetaTokenStatus: GetMetaTokenStatusUseCase,
    private readonly getTikTokTokenStatus: GetTikTokTokenStatusUseCase,
  ) {}

  @Get('meta/token-status')
  @ApiOperation({
    summary: 'Statut du cycle de vie des tokens Meta du user (FB + IG)',
    description:
      'Dérive VALID / EXPIRING_SOON / EXPIRED / RECONNECT_REQUIRED par plateforme à partir de l’expiration stockée et du drapeau de reconnexion.',
  })
  @ApiQuery({
    name: 'userId',
    format: 'uuid',
    example: '00000000-0000-0000-0000-000000000001',
  })
  @ApiOkResponse({ type: TokenStatusDto })
  @ApiNotFoundResponse({
    description: 'Aucun compte Meta connecté pour cet utilisateur.',
  })
  async metaTokenStatus(
    @Query('userId', new ParseUuidShapePipe()) userId: string,
  ): Promise<TokenStatusDto> {
    const result = await this.getMetaTokenStatus.execute(userId)
    return {
      facebook: result.facebook,
      instagram: result.instagram,
      expiresAt: result.expiresAt ? result.expiresAt.toISOString() : null,
      needsReconnect: result.needsReconnect,
    }
  }

  @Get('tiktok/token-status')
  @ApiOperation({
    summary: 'Statut du cycle de vie du token TikTok du user',
    description:
      'Dérive VALID / EXPIRING_SOON / EXPIRED / RECONNECT_REQUIRED à partir de l’expiration de l’access token (~24 h) et du drapeau de reconnexion. Lecture passive : ne déclenche pas de rafraîchissement (le refresh est effectué à la publication).',
  })
  @ApiQuery({
    name: 'userId',
    format: 'uuid',
    example: '00000000-0000-0000-0000-000000000001',
  })
  @ApiOkResponse({ type: TikTokTokenStatusDto })
  @ApiNotFoundResponse({
    description: 'Aucun compte TikTok connecté pour cet utilisateur.',
  })
  async tiktokTokenStatus(
    @Query('userId', new ParseUuidShapePipe()) userId: string,
  ): Promise<TikTokTokenStatusDto> {
    const result = await this.getTikTokTokenStatus.execute(userId)
    return {
      status: result.status,
      accountName: result.accountName,
      expiresAt: result.expiresAt ? result.expiresAt.toISOString() : null,
      needsReconnect: result.needsReconnect,
    }
  }

  @Post('publish')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Publier un même post sur plusieurs réseaux en une requête',
    description:
      'Orchestrateur multi-réseaux : diffuse vers chaque plateforme demandée en réutilisant les use-cases Facebook/Instagram. Les échecs sont isolés — une plateforme en erreur n’interrompt pas les autres. `success` global vaut true seulement si toutes les plateformes ont réussi.',
  })
  @ApiCreatedResponse({ type: PublishSocialResponseDto })
  @ApiBadRequestResponse({ description: 'Corps invalide (validation).' })
  async socialPublish(
    @Body() dto: PublishSocialDto,
  ): Promise<PublishSocialResponseDto> {
    return this.publishSocial.execute({
      userId: dto.userId,
      platforms: dto.platforms,
      message: dto.message,
      caption: dto.caption,
      imageUrl: dto.imageUrl,
      videoUrl: dto.videoUrl,
      linkUrl: dto.linkUrl,
      linkTitle: dto.linkTitle,
      linkDescription: dto.linkDescription,
      // Consommées uniquement par la branche YouTube de l'orchestrateur.
      youtubeOptions: dto.youtubeOptions,
    })
  }

  @Post('facebook/publish')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Publier un post de production sur la Page Facebook connectée',
    description:
      'Résout automatiquement la Page Facebook active du user. Si `imageUrl` est fournie, publie via POST /{pageId}/photos ; sinon via POST /{pageId}/feed.',
  })
  @ApiCreatedResponse({ type: PublishResponseDto })
  @ApiBadRequestResponse({ description: 'Corps invalide (validation).' })
  @ApiNotFoundResponse({
    description: 'Aucune Page Facebook active connectée pour cet utilisateur.',
  })
  @ApiBadGatewayResponse({ description: 'Échec de l’appel Graph API Meta.' })
  async facebookPublish(
    @Body() dto: PublishFacebookDto,
  ): Promise<PublishResponseDto> {
    const outcome = await this.publishFacebook.execute({
      userId: dto.userId,
      message: dto.message,
      imageUrl: dto.imageUrl,
    })
    return this.toPublishResponse('facebook', outcome)
  }

  @Post('instagram/publish')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Publier un post de production sur le compte Instagram Business connecté',
    description:
      'Résout automatiquement le compte IG actif du user, crée le conteneur média (POST /{igUserId}/media) puis le publie (POST /{igUserId}/media_publish). `imageUrl` doit être une URL publique accessible par Meta.',
  })
  @ApiCreatedResponse({ type: PublishResponseDto })
  @ApiBadRequestResponse({ description: 'Corps invalide (validation).' })
  @ApiNotFoundResponse({
    description:
      'Aucun compte Instagram Business actif connecté pour cet utilisateur.',
  })
  @ApiBadGatewayResponse({ description: 'Échec de l’appel Graph API Meta.' })
  async instagramPublish(
    @Body() dto: PublishInstagramDto,
  ): Promise<PublishResponseDto> {
    const outcome = await this.publishInstagram.execute({
      userId: dto.userId,
      imageUrl: dto.imageUrl,
      caption: dto.caption ?? '',
    })
    return this.toPublishResponse('instagram', outcome)
  }

  @Post('tiktok/publish')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Publier une vidéo (Direct Post) sur le compte TikTok connecté',
    description:
      'Résout automatiquement le compte TikTok actif du user, rafraîchit le token si nécessaire, interroge creator_info, initialise la publication (source PULL_FROM_URL) puis suit le statut. `videoUrl` doit être une URL publique accessible par TikTok. Note : une app non auditée publie en SELF_ONLY (privé).',
  })
  @ApiCreatedResponse({ type: PublishResponseDto })
  @ApiBadRequestResponse({ description: 'Corps invalide (validation).' })
  @ApiNotFoundResponse({
    description: 'Aucun compte TikTok actif connecté pour cet utilisateur.',
  })
  @ApiBadGatewayResponse({ description: 'Échec de l’appel TikTok Content API.' })
  async tiktokPublish(
    @Body() dto: PublishTikTokDto,
  ): Promise<PublishResponseDto> {
    const outcome = await this.publishTikTok.execute({
      userId: dto.userId,
      videoUrl: dto.videoUrl,
      caption: dto.caption ?? '',
    })
    return this.toPublishResponse('tiktok', outcome)
  }

  /// Projette un PublicationOutcome (succès/échec) en réponse HTTP unique.
  private toPublishResponse(
    platform: 'facebook' | 'instagram' | 'tiktok',
    outcome: PublicationOutcome,
  ): PublishResponseDto {
    if (outcome.success) {
      return { success: true, platform, externalPostId: outcome.externalPostId }
    }
    return {
      success: false,
      platform,
      code: outcome.error.code,
      subcode: outcome.error.subcode,
      reason: outcome.error.reason,
      retryable: outcome.error.retryable,
      action: outcome.error.action,
    }
  }

  @Post('facebook/test-post')
  @ApiOperation({
    summary: 'Publier un message de test sur la Page Facebook connectée',
    description:
      'Récupère la première Page Facebook active du user puis appelle POST /{pageId}/feed.',
  })
  @ApiOkResponse({ type: FacebookTestPostResponseDto })
  async facebookTestPost(
    @Body() dto: FacebookTestPostDto,
  ): Promise<FacebookTestPostResponseDto> {
    return this.publishFacebookTestPost.execute({
      userId: dto.userId,
      message: dto.message,
    })
  }

  @Get('facebook/pages')
  @ApiOperation({ summary: 'Lister les Pages Facebook connectées (depuis la base)' })
  @ApiQuery({
    name: 'userId',
    format: 'uuid',
    example: '00000000-0000-0000-0000-000000000001',
  })
  @ApiOkResponse({ type: [FacebookPageDto] })
  async facebookPages(
    @Query('userId', new ParseUuidShapePipe()) userId: string,
  ): Promise<FacebookPageDto[]> {
    return this.getFacebookPages.execute(userId)
  }

  @Post('instagram/test-post')
  @ApiOperation({
    summary: 'Publier une image sur le compte Instagram Business connecté',
    description:
      'Récupère le compte IG actif du user, crée le conteneur média (POST /{igUserId}/media) puis le publie (POST /{igUserId}/media_publish). imageUrl doit être une URL publique accessible par Meta.',
  })
  @ApiOkResponse({ type: InstagramTestPostResponseDto })
  async instagramTestPost(
    @Body() dto: InstagramTestPostDto,
  ): Promise<InstagramTestPostResponseDto> {
    return this.publishInstagramTestPost.execute({
      userId: dto.userId,
      imageUrl: dto.imageUrl,
      caption: dto.caption ?? '',
    })
  }

  @Get('instagram/accounts')
  @ApiOperation({
    summary: 'Lister les comptes Instagram Business connectés (depuis la base)',
  })
  @ApiQuery({
    name: 'userId',
    format: 'uuid',
    example: '00000000-0000-0000-0000-000000000001',
  })
  @ApiOkResponse({ type: [InstagramAccountDto] })
  async instagramAccounts(
    @Query('userId', new ParseUuidShapePipe()) userId: string,
  ): Promise<InstagramAccountDto[]> {
    return this.getInstagramAccounts.execute(userId)
  }

  @Get('accounts')
  @ApiOperation({
    summary: 'Lister tous les SocialAccounts persistés du user (sans tokens)',
  })
  @ApiQuery({
    name: 'userId',
    format: 'uuid',
    example: '00000000-0000-0000-0000-000000000001',
  })
  @ApiOkResponse({ type: [ConnectedAccountDto] })
  async accounts(
    @Query('userId', new ParseUuidShapePipe()) userId: string,
  ): Promise<ConnectedAccountDto[]> {
    return this.getConnectedAccounts.execute(userId) as Promise<ConnectedAccountDto[]>
  }

  @Get('debug/token')
  @ApiOperation({
    summary: 'Diagnostic des tokens Meta (token jamais exposé en clair)',
  })
  @ApiQuery({
    name: 'userId',
    format: 'uuid',
    example: '00000000-0000-0000-0000-000000000001',
  })
  @ApiOkResponse({ type: TokenDebugResponseDto })
  async tokenDebug(
    @Query('userId', new ParseUuidShapePipe()) userId: string,
  ): Promise<TokenDebugResponseDto> {
    return this.debugToken.execute(userId)
  }

  @Get('facebook/profile')
  @ApiOperation({
    summary: 'Vérifier le token via Graph API et renvoyer le profil de la Page',
    description:
      "Appel Graph live GET /{pageId}?fields=id,name (l'OAuth ne persiste que le page token, pas le user token requis par /me/accounts).",
  })
  @ApiQuery({
    name: 'userId',
    format: 'uuid',
    example: '00000000-0000-0000-0000-000000000001',
  })
  @ApiOkResponse({ type: FacebookProfileResponseDto })
  async facebookProfile(
    @Query('userId', new ParseUuidShapePipe()) userId: string,
  ): Promise<FacebookProfileResponseDto> {
    return this.getFacebookProfile.execute(userId)
  }
}
