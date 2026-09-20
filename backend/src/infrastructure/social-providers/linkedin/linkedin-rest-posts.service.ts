import { HttpService } from '@nestjs/axios'
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { firstValueFrom } from 'rxjs'
import type {
  LinkedInContentGateway,
  LinkedInPublishArticleInput,
  LinkedInPublishImageInput,
  LinkedInPublishResult,
  LinkedInPublishTextInput,
} from '../../../application/social/ports/linkedin-content.gateway.js'
import { LinkedInContentError } from '../../../application/social/errors/linkedin-content.error.js'
import { LinkedInConfig } from '../../../config/linkedin.config.js'
import { LinkedInImageUploader } from './linkedin-image-uploader.js'

/// Adaptateur Posts API versionnée (`POST /rest/posts`). Cible primaire de la
/// publication membre (la Posts API remplace officiellement ugcPosts et accepte
/// `w_member_social`). Le use case ne connaît jamais cet endpoint. Aucun appel
/// organisation. Ne journalise jamais le token / Authorization.
@Injectable()
export class LinkedInRestPostsService implements LinkedInContentGateway {
  private readonly logger = new Logger(LinkedInRestPostsService.name)

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly uploader: LinkedInImageUploader,
  ) {}

  private get linkedin(): LinkedInConfig {
    return this.config.getOrThrow<LinkedInConfig>('linkedin')
  }

  async publishText(
    input: LinkedInPublishTextInput,
  ): Promise<LinkedInPublishResult> {
    return this.createPost(input.accessToken, {
      author: input.author.urn,
      commentary: input.text,
      visibility: input.visibility,
      distribution: this.distribution(),
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    })
  }

  async publishArticle(
    input: LinkedInPublishArticleInput,
  ): Promise<LinkedInPublishResult> {
    // LinkedIn ne scrape pas l'URL : on fournit titre/description explicitement.
    const article: Record<string, unknown> = { source: input.url }
    if (input.title) article['title'] = input.title
    if (input.description) article['description'] = input.description

    return this.createPost(input.accessToken, {
      author: input.author.urn,
      commentary: input.text,
      visibility: input.visibility,
      distribution: this.distribution(),
      content: { article },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    })
  }

  async publishImage(
    input: LinkedInPublishImageInput,
  ): Promise<LinkedInPublishResult> {
    const imageUrn = await this.uploader.uploadForRest({
      accessToken: input.accessToken,
      ownerUrn: input.author.urn,
      imageUrl: input.imageUrl,
      apiBaseUrl: this.linkedin.apiBaseUrl,
      apiVersion: this.linkedin.apiVersion,
    })

    const media: Record<string, unknown> = { id: imageUrn }
    if (input.altText) media['altText'] = input.altText

    return this.createPost(input.accessToken, {
      author: input.author.urn,
      commentary: input.text,
      visibility: input.visibility,
      distribution: this.distribution(),
      content: { media },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    })
  }

  private distribution() {
    return {
      feedDistribution: 'MAIN_FEED',
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    }
  }

  /// POST /rest/posts avec en-têtes versionnés. Extrait l'URN du post de `x-restli-id`.
  private async createPost(
    accessToken: string,
    body: Record<string, unknown>,
  ): Promise<LinkedInPublishResult> {
    const res = await firstValueFrom(
      this.http.post(`${this.linkedin.apiBaseUrl}/rest/posts`, body, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0',
          'LinkedIn-Version': this.linkedin.apiVersion,
          'Content-Type': 'application/json',
        },
      }),
    )

    const postUrn = this.extractRestliId(res.headers)
    if (!postUrn) {
      throw new LinkedInContentError({
        serviceErrorCode: 'missing_restli_id',
        httpStatus: res.status ?? 201,
        message: "Réponse LinkedIn sans en-tête x-restli-id (URN du post introuvable)",
      })
    }
    return { postUrn }
  }

  /// Lit l'en-tête `x-restli-id` (insensible à la casse) contenant l'URN du post.
  private extractRestliId(headers: unknown): string | null {
    if (typeof headers !== 'object' || headers === null) return null
    const record = headers as Record<string, unknown>
    const value = record['x-restli-id'] ?? record['X-RestLi-Id']
    return typeof value === 'string' && value.length > 0 ? value : null
  }
}
