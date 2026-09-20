import { Module } from '@nestjs/common'
import { ScheduledPostsController } from './scheduled-posts.controller.js'
import { CreateScheduledPostUseCase } from '../../application/scheduled-post/use-cases/create-scheduled-post.use-case.js'
import { GetScheduledPostsUseCase } from '../../application/scheduled-post/use-cases/get-scheduled-posts.use-case.js'
import { GetScheduledPostByIdUseCase } from '../../application/scheduled-post/use-cases/get-scheduled-post-by-id.use-case.js'
import { CancelScheduledPostUseCase } from '../../application/scheduled-post/use-cases/cancel-scheduled-post.use-case.js'
import { ProcessDueScheduledPostsUseCase } from '../../application/scheduled-post/use-cases/process-due-scheduled-posts.use-case.js'
import { ScheduledPostsScheduler } from '../../infrastructure/scheduling/scheduled-posts.scheduler.js'
import { PersistenceModule } from '../../infrastructure/prisma/persistence.module.js'
import { SocialModule } from '../social/social.module.js'

/// Planification des publications. Réutilise SCHEDULED_POST_REPOSITORY
/// (PersistenceModule) et PublishSocialUseCase (SocialModule) — aucune
/// duplication de la logique de publication. Le scheduler déclenche
/// périodiquement le traitement des publications dues.
@Module({
  imports: [PersistenceModule, SocialModule],
  controllers: [ScheduledPostsController],
  providers: [
    CreateScheduledPostUseCase,
    GetScheduledPostsUseCase,
    GetScheduledPostByIdUseCase,
    CancelScheduledPostUseCase,
    ProcessDueScheduledPostsUseCase,
    ScheduledPostsScheduler,
  ],
})
export class ScheduledPostModule {}
