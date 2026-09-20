import { Module } from '@nestjs/common'
import { USER_REPOSITORY } from '../../domain/user/repositories/user.repository.js'
import { SOCIAL_ACCOUNT_REPOSITORY } from '../../domain/social-account/repositories/social-account.repository.js'
import { POST_REPOSITORY } from '../../domain/post/repositories/post.repository.js'
import { SOCIAL_POST_REPOSITORY } from '../../domain/social-post/repositories/social-post.repository.js'
import { SCHEDULED_POST_REPOSITORY } from '../../domain/scheduled-post/repositories/scheduled-post.repository.js'
import { PrismaUserRepository } from './repositories/prisma-user.repository.js'
import { PrismaSocialAccountRepository } from './repositories/prisma-social-account.repository.js'
import { PrismaPostRepository } from './repositories/prisma-post.repository.js'
import { PrismaSocialPostRepository } from './repositories/prisma-social-post.repository.js'
import { PrismaScheduledPostRepository } from './repositories/prisma-scheduled-post.repository.js'

/// Lie chaque token de repository (domaine) à son implémentation Prisma.
/// Les use cases injecteront ces tokens — jamais les classes Prisma (DIP).
@Module({
  providers: [
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: SOCIAL_ACCOUNT_REPOSITORY, useClass: PrismaSocialAccountRepository },
    { provide: POST_REPOSITORY, useClass: PrismaPostRepository },
    { provide: SOCIAL_POST_REPOSITORY, useClass: PrismaSocialPostRepository },
    {
      provide: SCHEDULED_POST_REPOSITORY,
      useClass: PrismaScheduledPostRepository,
    },
  ],
  exports: [
    USER_REPOSITORY,
    SOCIAL_ACCOUNT_REPOSITORY,
    POST_REPOSITORY,
    SOCIAL_POST_REPOSITORY,
    SCHEDULED_POST_REPOSITORY,
  ],
})
export class PersistenceModule {}
