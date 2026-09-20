import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { SocialPost } from '../../../domain/social-post/entities/social-post.entity.js'
import { SOCIAL_POST_REPOSITORY } from '../../../domain/social-post/repositories/social-post.repository.js'
import type { SocialPostRepository } from '../../../domain/social-post/repositories/social-post.repository.js'

/// Retourne une publication par son id, ou 404 si elle n'existe pas.
@Injectable()
export class GetSocialPostByIdUseCase {
  constructor(
    @Inject(SOCIAL_POST_REPOSITORY)
    private readonly socialPosts: SocialPostRepository,
  ) {}

  async execute(id: string): Promise<SocialPost> {
    const post = await this.socialPosts.findById(id)
    if (!post) {
      throw new NotFoundException(`Publication ${id} introuvable.`)
    }
    return post
  }
}
