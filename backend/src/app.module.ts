import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ScheduleModule } from '@nestjs/schedule'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import metaConfig from './config/meta.config.js'
import tiktokConfig from './config/tiktok.config.js'
import linkedinConfig from './config/linkedin.config.js'
import youtubeConfig from './config/youtube.config.js'
import oauthSecurityConfig from './config/oauth-security.config.js'
import frontendConfig from './config/frontend.config.js'
import mediaConfig from './config/media.config.js'
import { PrismaModule } from './infrastructure/prisma/prisma.module.js'
import { PersistenceModule } from './infrastructure/prisma/persistence.module.js'
import { AuthModule } from './presentation/auth/auth.module.js'
import { SocialModule } from './presentation/social/social.module.js'
import { SocialPostModule } from './presentation/social-post/social-post.module.js'
import { ScheduledPostModule } from './presentation/scheduled-post/scheduled-post.module.js'
import { AnalyticsModule } from './presentation/analytics/analytics.module.js'
import { MediaModule } from './presentation/media/media.module.js'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        metaConfig,
        tiktokConfig,
        linkedinConfig,
        youtubeConfig,
        oauthSecurityConfig,
        frontendConfig,
        mediaConfig,
      ],
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    PersistenceModule,
    AuthModule,
    SocialModule,
    SocialPostModule,
    ScheduledPostModule,
    AnalyticsModule,
    MediaModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
