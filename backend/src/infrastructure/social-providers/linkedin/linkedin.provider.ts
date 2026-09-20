import { Injectable, OnModuleInit } from '@nestjs/common'
import {
  SocialProviderPort,
  SocialPlatform,
  ConnectResult,
  PublishPostPayload,
  PublishedPostResult,
  UploadMediaResult,
  AnalyticsResult,
} from '../../../domain/shared/ports/social-provider.port.js'
import { SocialProviderRegistry } from '../registry/social-provider.registry.js'

@Injectable()
export class LinkedinProvider implements SocialProviderPort, OnModuleInit {
  readonly platform: SocialPlatform = 'linkedin'

  constructor(private readonly registry: SocialProviderRegistry) {}

  onModuleInit(): void {
    this.registry.register(this)
  }

  async connect(_authCode: string): Promise<ConnectResult> {
    throw new Error('LinkedinProvider.connect() — not yet implemented')
  }

  async disconnect(_accountId: string): Promise<void> {
    throw new Error('LinkedinProvider.disconnect() — not yet implemented')
  }

  async publishPost(
    _accountId: string,
    _payload: PublishPostPayload,
  ): Promise<PublishedPostResult> {
    throw new Error('LinkedinProvider.publishPost() — not yet implemented')
  }

  async uploadMedia(
    _accountId: string,
    _fileBuffer: Buffer,
    _mimeType: string,
  ): Promise<UploadMediaResult> {
    throw new Error('LinkedinProvider.uploadMedia() — not yet implemented')
  }

  async deletePost(_accountId: string, _externalPostId: string): Promise<void> {
    throw new Error('LinkedinProvider.deletePost() — not yet implemented')
  }

  async getAnalytics(
    _accountId: string,
    _from: Date,
    _to: Date,
  ): Promise<AnalyticsResult> {
    throw new Error('LinkedinProvider.getAnalytics() — not yet implemented')
  }
}
