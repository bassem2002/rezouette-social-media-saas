import { Inject, Injectable } from '@nestjs/common'
import { ScheduledPost } from '../../../domain/scheduled-post/entities/scheduled-post.entity.js'
import { SCHEDULED_POST_REPOSITORY } from '../../../domain/scheduled-post/repositories/scheduled-post.repository.js'
import type { ScheduledPostRepository } from '../../../domain/scheduled-post/repositories/scheduled-post.repository.js'

/// Liste les publications programmées. Si `userId` est fourni, filtre sur cet
/// utilisateur ; sinon retourne toutes les planifications (échéance la plus
/// proche d'abord).
@Injectable()
export class GetScheduledPostsUseCase {
  constructor(
    @Inject(SCHEDULED_POST_REPOSITORY)
    private readonly scheduledPosts: ScheduledPostRepository,
  ) {}

  execute(userId?: string): Promise<ScheduledPost[]> {
    return userId
      ? this.scheduledPosts.findByUserId(userId)
      : this.scheduledPosts.findAll()
  }
}
