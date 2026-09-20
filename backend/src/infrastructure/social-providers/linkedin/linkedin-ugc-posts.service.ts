import { HttpService } from '@nestjs/axios'
import { Injectable } from '@nestjs/common'
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

/// Adaptateur UGC legacy (`POST /v2/ugcPosts`) — fallback potentiel pour le profil
/// membre si la sonde révèle que `/rest/posts` n'est pas accessible à l'app
/// self-serve. Contrat identique (le use case ne change pas). Ne journalise jamais
/// le token / Authorization. Aucun appel organisation.
@Injectable()
export class LinkedInUgcPostsService implements LinkedInContentGateway {
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
    return this.createUgcPost(input.accessToken, input.author.urn, {
      shareCommentary: { text: input.text },
      shareMediaCategory: 'NONE',
    }, input.visibility)
  }

  async publishArticle(
    input: LinkedInPublishArticleInput,
  ): Promise<LinkedInPublishResult> {
    const media: Record<string, unknown> = {
      status: 'READY',
      originalUrl: input.url,
    }
    if (input.title) media['title'] = { text: input.title }
    if (input.description) media['description'] = { text: input.description }

    return this.createUgcPost(input.accessToken, input.author.urn, {
      shareCommentary: { text: input.text },
      shareMediaCategory: 'ARTICLE',
      media: [media],
    }, input.visibility)
  }

  async publishImage(
    input: LinkedInPublishImageInput,
  ): Promise<LinkedInPublishResult> {
    const assetUrn = await this.uploader.uploadForUgc({
      accessToken: input.accessToken,
      ownerUrn: input.author.urn,
      imageUrl: input.imageUrl,
      apiBaseUrl: this.linkedin.apiBaseUrl,
    })

    const media: Record<string, unknown> = { status: 'READY', media: assetUrn }
    if (input.altText) {
      media['description'] = { text: input.altText }
    }

    return this.createUgcPost(input.accessToken, input.author.urn, {
      shareCommentary: { text: input.text },
      shareMediaCategory: 'IMAGE',
      media: [media],
    }, input.visibility)
  }

  /// POST /v2/ugcPosts. Extrait l'URN du post de `x-restli-id`.
  private async createUgcPost(
    accessToken: string,
    authorUrn: string,
    shareContent: Record<string, unknown>,
    visibility: 'PUBLIC' | 'CONNECTIONS',
  ): Promise<LinkedInPublishResult> {
    const body = {
      author: authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: { 'com.linkedin.ugc.ShareContent': shareContent },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': visibility,
      },
    }

    const res = await firstValueFrom(
      this.http.post(`${this.linkedin.apiBaseUrl}/v2/ugcPosts`, body, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0',
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

  private extractRestliId(headers: unknown): string | null {
    if (typeof headers !== 'object' || headers === null) return null
    const record = headers as Record<string, unknown>
    const value = record['x-restli-id'] ?? record['X-RestLi-Id']
    return typeof value === 'string' && value.length > 0 ? value : null
  }
}
