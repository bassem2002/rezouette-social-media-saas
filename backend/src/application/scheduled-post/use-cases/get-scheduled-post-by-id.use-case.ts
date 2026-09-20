import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { ScheduledPost } from '../../../domain/scheduled-post/entities/scheduled-post.entity.js'
import { SCHEDULED_POST_REPOSITORY } from '../../../domain/scheduled-post/repositories/scheduled-post.repository.js'
import type { ScheduledPostRepository } from '../../../domain/scheduled-post/repositories/scheduled-post.repository.js'

/// Récupère une publication programmée par son id (404 si absente).
@Injectable()
export class GetScheduledPostByIdUseCase {
  constructor(
    @Inject(SCHEDULED_POST_REPOSITORY)
    private readonly scheduledPosts: ScheduledPostRepository,
  ) {}

  async execute(id: string): Promise<ScheduledPost> {
    const post = await this.scheduledPosts.findById(id)
    if (!post) {
      throw new NotFoundException('Publication programmée introuvable.')
    }
    return post
  }
}
