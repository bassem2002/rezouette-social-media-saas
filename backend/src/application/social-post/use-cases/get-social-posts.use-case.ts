import { Inject, Injectable } from '@nestjs/common'
import { SocialPost } from '../../../domain/social-post/entities/social-post.entity.js'
import { SOCIAL_POST_REPOSITORY } from '../../../domain/social-post/repositories/social-post.repository.js'
import type { SocialPostRepository } from '../../../domain/social-post/repositories/social-post.repository.js'

/// Retourne tout l'historique des publications (les plus récentes d'abord).
@Injectable()
export class GetSocialPostsUseCase {
  constructor(
    @Inject(SOCIAL_POST_REPOSITORY)
    private readonly socialPosts: SocialPostRepository,
  ) {}

  execute(): Promise<SocialPost[]> {
    return this.socialPosts.findAll()
  }
}
