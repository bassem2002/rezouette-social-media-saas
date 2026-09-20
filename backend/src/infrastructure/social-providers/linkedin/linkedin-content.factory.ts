import { Injectable, type Provider } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  LINKEDIN_CONTENT_GATEWAY,
  type LinkedInContentGateway,
  type LinkedInPublishResult,
} from '../../../application/social/ports/linkedin-content.gateway.js'
import { LinkedInContentError } from '../../../application/social/errors/linkedin-content.error.js'
import { LinkedInConfig } from '../../../config/linkedin.config.js'
import { LinkedInRestPostsService } from './linkedin-rest-posts.service.js'
import { LinkedInUgcPostsService } from './linkedin-ugc-posts.service.js'

/// Adaptateur "publication désactivée" (LINKEDIN_PUBLISH_API=disabled, défaut sûr).
/// N'émet AUCUN appel réseau : lève immédiatement une erreur normalisée que le
/// use case archive en PUBLISHING_NOT_CONFIGURED. AUCUN fallback automatique.
@Injectable()
export class DisabledLinkedInContentService implements LinkedInContentGateway {
  private fail(): Promise<LinkedInPublishResult> {
    return Promise.reject(
      new LinkedInContentError({
        serviceErrorCode: 'publishing_not_configured',
        httpStatus: 503,
        message:
          'LinkedIn publishing is not configured (LINKEDIN_PUBLISH_API=disabled).',
      }),
    )
  }

  publishText(): Promise<LinkedInPublishResult> {
    return this.fail()
  }
  publishArticle(): Promise<LinkedInPublishResult> {
    return this.fail()
  }
  publishImage(): Promise<LinkedInPublishResult> {
    return this.fail()
  }
}

/// Provider de sélection de l'adaptateur LinkedIn actif d'après LINKEDIN_PUBLISH_API.
/// `disabled` → DisabledLinkedInContentService ; `rest` → /rest/posts ;
/// `ugc` → /v2/ugcPosts. Le use case reste totalement agnostique de ce choix.
export const linkedinContentGatewayProvider: Provider = {
  provide: LINKEDIN_CONTENT_GATEWAY,
  inject: [
    ConfigService,
    LinkedInRestPostsService,
    LinkedInUgcPostsService,
    DisabledLinkedInContentService,
  ],
  useFactory: (
    config: ConfigService,
    rest: LinkedInRestPostsService,
    ugc: LinkedInUgcPostsService,
    disabled: DisabledLinkedInContentService,
  ): LinkedInContentGateway => {
    const mode = config.getOrThrow<LinkedInConfig>('linkedin').publishApi
    switch (mode) {
      case 'rest':
        return rest
      case 'ugc':
        return ugc
      default:
        return disabled
    }
  },
}
