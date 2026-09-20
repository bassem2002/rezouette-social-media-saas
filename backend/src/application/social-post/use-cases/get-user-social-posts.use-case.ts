import { Inject, Injectable } from '@nestjs/common'
import { SocialPost } from '../../../domain/social-post/entities/social-post.entity.js'
import { SOCIAL_POST_REPOSITORY } from '../../../domain/social-post/repositories/social-post.repository.js'
import type { SocialPostRepository } from '../../../domain/social-post/repositories/social-post.repository.js'

/// Retourne l'historique des publications d'un utilisateur donné.
@Injectable()
export class GetUserSocialPostsUseCase {
  constructor(
    @Inject(SOCIAL_POST_REPOSITORY)
    private readonly socialPosts: SocialPostRepository,
  ) {}

  execute(userId: string): Promise<SocialPost[]> {
    return this.socialPosts.findByUserId(userId)
  }
}
