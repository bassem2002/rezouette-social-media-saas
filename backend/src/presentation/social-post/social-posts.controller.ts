import { Controller, Get, Param } from '@nestjs/common'
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger'
import { GetSocialPostsUseCase } from '../../application/social-post/use-cases/get-social-posts.use-case.js'
import { GetSocialPostByIdUseCase } from '../../application/social-post/use-cases/get-social-post-by-id.use-case.js'
import { GetUserSocialPostsUseCase } from '../../application/social-post/use-cases/get-user-social-posts.use-case.js'
import { ParseUuidShapePipe } from '../social/pipes/parse-uuid-shape.pipe.js'
import { SocialPostResponseDto } from './dto/social-post-response.dto.js'
import { toSocialPostResponse } from './social-post.presenter.js'

/// Lecture seule de l'historique des publications. Couche présentation pure :
/// délègue aux use-cases, ne touche jamais Prisma directement.
@ApiTags('Social — Historique des publications')
@Controller('social/posts')
export class SocialPostsController {
  constructor(
    private readonly getSocialPosts: GetSocialPostsUseCase,
    private readonly getSocialPostById: GetSocialPostByIdUseCase,
    private readonly getUserSocialPosts: GetUserSocialPostsUseCase,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Lister tout l’historique des publications (récentes d’abord)',
  })
  @ApiOkResponse({ type: [SocialPostResponseDto] })
  async findAll(): Promise<SocialPostResponseDto[]> {
    const posts = await this.getSocialPosts.execute()
    return posts.map(toSocialPostResponse)
  }

  @Get('user/:userId')
  @ApiOperation({
    summary: 'Lister l’historique des publications d’un utilisateur',
  })
  @ApiParam({
    name: 'userId',
    format: 'uuid',
    example: '00000000-0000-0000-0000-000000000001',
  })
  @ApiOkResponse({ type: [SocialPostResponseDto] })
  async findByUser(
    @Param('userId', new ParseUuidShapePipe()) userId: string,
  ): Promise<SocialPostResponseDto[]> {
    const posts = await this.getUserSocialPosts.execute(userId)
    return posts.map(toSocialPostResponse)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Récupérer une publication par son id' })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    example: 'b3f1c2d4-0000-0000-0000-000000000abc',
  })
  @ApiOkResponse({ type: SocialPostResponseDto })
  @ApiNotFoundResponse({ description: 'Publication introuvable.' })
  async findById(
    @Param('id', new ParseUuidShapePipe()) id: string,
  ): Promise<SocialPostResponseDto> {
    const post = await this.getSocialPostById.execute(id)
    return toSocialPostResponse(post)
  }
}
