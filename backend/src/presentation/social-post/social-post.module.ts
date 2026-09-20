import { Module } from '@nestjs/common'
import { SocialPostsController } from './social-posts.controller.js'
import { GetSocialPostsUseCase } from '../../application/social-post/use-cases/get-social-posts.use-case.js'
import { GetSocialPostByIdUseCase } from '../../application/social-post/use-cases/get-social-post-by-id.use-case.js'
import { GetUserSocialPostsUseCase } from '../../application/social-post/use-cases/get-user-social-posts.use-case.js'
import { PersistenceModule } from '../../infrastructure/prisma/persistence.module.js'

/// Lecture de l'historique des publications. Réutilise SOCIAL_POST_REPOSITORY
/// exposé par PersistenceModule. L'écriture de l'historique se fait ailleurs
/// (PublicationRecorder, dans SocialModule) — ici uniquement des GET.
@Module({
  imports: [PersistenceModule],
  controllers: [SocialPostsController],
  providers: [
    GetSocialPostsUseCase,
    GetSocialPostByIdUseCase,
    GetUserSocialPostsUseCase,
  ],
})
export class SocialPostModule {}
