import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { ScheduledPost } from '../../../domain/scheduled-post/entities/scheduled-post.entity.js'
import { ScheduledPostStateError } from '../../../domain/scheduled-post/entities/scheduled-post.entity.js'
import { SCHEDULED_POST_REPOSITORY } from '../../../domain/scheduled-post/repositories/scheduled-post.repository.js'
import type { ScheduledPostRepository } from '../../../domain/scheduled-post/repositories/scheduled-post.repository.js'

/// Annule une publication programmée (passage en CANCELLED). Annulation logique
/// — la ligne est conservée pour la traçabilité, jamais supprimée physiquement.
/// Refusée si la publication a déjà quitté l'état SCHEDULED.
@Injectable()
export class CancelScheduledPostUseCase {
  constructor(
    @Inject(SCHEDULED_POST_REPOSITORY)
    private readonly scheduledPosts: ScheduledPostRepository,
  ) {}

  async execute(id: string): Promise<ScheduledPost> {
    const post = await this.scheduledPosts.findById(id)
    if (!post) {
      throw new NotFoundException('Publication programmée introuvable.')
    }

    try {
      post.cancel()
    } catch (err) {
      if (err instanceof ScheduledPostStateError) {
        throw new ConflictException(err.message)
      }
      throw err
    }

    await this.scheduledPosts.save(post)
    return post
  }
}
