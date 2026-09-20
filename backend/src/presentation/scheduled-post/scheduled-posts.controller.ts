import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger'
import { CreateScheduledPostUseCase } from '../../application/scheduled-post/use-cases/create-scheduled-post.use-case.js'
import { GetScheduledPostsUseCase } from '../../application/scheduled-post/use-cases/get-scheduled-posts.use-case.js'
import { GetScheduledPostByIdUseCase } from '../../application/scheduled-post/use-cases/get-scheduled-post-by-id.use-case.js'
import { CancelScheduledPostUseCase } from '../../application/scheduled-post/use-cases/cancel-scheduled-post.use-case.js'
import { ParseUuidShapePipe } from '../social/pipes/parse-uuid-shape.pipe.js'
import type { ScheduledPlatformOptions } from '../../domain/scheduled-post/value-objects/scheduled-platform-options.js'
import { createYouTubeScheduleOptions } from '../../domain/scheduled-post/value-objects/youtube-schedule-options.js'
import {
  CreateScheduledPostDto,
  type ScheduledPlatformOptionsDto,
} from './dto/create-scheduled-post.dto.js'
import { ScheduledPostResponseDto } from './dto/scheduled-post-response.dto.js'
import { toScheduledPostResponse } from './scheduled-post.presenter.js'

/// Traduit le corps HTTP (champs tous optionnels) en objet-valeur du domaine.
/// Les défauts des champs obligatoires viennent de la fabrique du domaine — la
/// présentation ne décide d'aucune politique métier.
function toDomainPlatformOptions(
  dto: ScheduledPlatformOptionsDto | undefined,
): ScheduledPlatformOptions | null {
  if (!dto?.youtube) return null
  return { youtube: createYouTubeScheduleOptions(dto.youtube) }
}

/// Gestion des publications programmées. Couche présentation pure : délègue aux
/// use-cases (création, lecture, annulation). L'exécution différée est assurée
/// par le scheduler — ce controller ne publie jamais directement.
@ApiTags('Social — Publications programmées')
@Controller('social/scheduled-posts')
export class ScheduledPostsController {
  constructor(
    private readonly createScheduledPost: CreateScheduledPostUseCase,
    private readonly getScheduledPosts: GetScheduledPostsUseCase,
    private readonly getScheduledPostById: GetScheduledPostByIdUseCase,
    private readonly cancelScheduledPost: CancelScheduledPostUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Programmer une publication (envoi différé à scheduledAt)',
    description:
      'Crée une publication à l’état SCHEDULED. Elle ne part pas immédiatement : le scheduler la publiera automatiquement à l’échéance via l’orchestrateur multi-réseaux. ' +
      'imageUrl est requise si Instagram est ciblé ; videoUrl est requise si TikTok ou YouTube est ciblé.\n\n' +
      '**YouTube** — `platformOptions.youtube` est alors OBLIGATOIRE et doit contenir : ' +
      '`accountId` (UUID de la chaîne cible, qui doit appartenir à l’utilisateur), ' +
      '`title` (100 caractères max) et `madeForKids` (booléen strict — déclaration COPPA, ' +
      'jamais supposée). Optionnels : `description` (5000 max), `tags`, `categoryId`, ' +
      '`privacyStatus` (private par défaut), `containsSyntheticMedia`, `notifySubscribers`.\n\n' +
      '⚠️ **Sémantique de `scheduledAt`** : c’est l’instant où Zernio DÉMARRE le transfert ' +
      'vers YouTube — ce n’est pas une date de publication native YouTube (`status.publishAt` ' +
      'n’est pas utilisé). La vidéo devient visible une fois l’encodage terminé côté YouTube, ' +
      'ce que la réconciliation constate ensuite.',
  })
  @ApiCreatedResponse({ type: ScheduledPostResponseDto })
  @ApiBadRequestResponse({
    description:
      'Corps invalide, date passée, image manquante pour Instagram, vidéo manquante pour TikTok/YouTube, options YouTube incomplètes, chaîne YouTube inconnue, ou options YouTube fournies sans cibler youtube.',
  })
  async create(
    @Body() dto: CreateScheduledPostDto,
  ): Promise<ScheduledPostResponseDto> {
    const post = await this.createScheduledPost.execute({
      userId: dto.userId,
      platforms: dto.platforms,
      message: dto.message,
      caption: dto.caption,
      imageUrl: dto.imageUrl,
      videoUrl: dto.videoUrl,
      platformOptions: toDomainPlatformOptions(dto.platformOptions),
      scheduledAt: dto.scheduledAt,
    })
    return toScheduledPostResponse(post)
  }

  @Get()
  @ApiOperation({
    summary: 'Lister les publications programmées (échéance la plus proche d’abord)',
    description:
      'Sans paramètre : toutes les planifications. Avec userId : uniquement celles de l’utilisateur.',
  })
  @ApiQuery({
    name: 'userId',
    required: false,
    format: 'uuid',
    example: '00000000-0000-0000-0000-000000000001',
  })
  @ApiOkResponse({ type: [ScheduledPostResponseDto] })
  async findAll(
    @Query('userId') userId?: string,
  ): Promise<ScheduledPostResponseDto[]> {
    const normalizedUserId = userId
      ? new ParseUuidShapePipe().transform(userId)
      : undefined
    const posts = await this.getScheduledPosts.execute(normalizedUserId)
    return posts.map(toScheduledPostResponse)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Récupérer une publication programmée par son id' })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    example: 'b3f1c2d4-0000-0000-0000-000000000abc',
  })
  @ApiOkResponse({ type: ScheduledPostResponseDto })
  @ApiNotFoundResponse({ description: 'Publication programmée introuvable.' })
  async findById(
    @Param('id', new ParseUuidShapePipe()) id: string,
  ): Promise<ScheduledPostResponseDto> {
    const post = await this.getScheduledPostById.execute(id)
    return toScheduledPostResponse(post)
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Annuler une publication programmée (passage en CANCELLED)',
    description:
      'Annulation logique : la planification est conservée pour la traçabilité. Possible uniquement tant que la publication est encore SCHEDULED.',
  })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    example: 'b3f1c2d4-0000-0000-0000-000000000abc',
  })
  @ApiOkResponse({ type: ScheduledPostResponseDto })
  @ApiNotFoundResponse({ description: 'Publication programmée introuvable.' })
  @ApiConflictResponse({
    description: 'Publication déjà en cours de traitement ou terminée — annulation impossible.',
  })
  async cancel(
    @Param('id', new ParseUuidShapePipe()) id: string,
  ): Promise<ScheduledPostResponseDto> {
    const post = await this.cancelScheduledPost.execute(id)
    return toScheduledPostResponse(post)
  }
}
