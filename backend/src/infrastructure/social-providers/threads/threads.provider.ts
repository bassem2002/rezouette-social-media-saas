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
export class ThreadsProvider implements SocialProviderPort, OnModuleInit {
  readonly platform: SocialPlatform = 'threads'

  constructor(private readonly registry: SocialProviderRegistry) {}

  onModuleInit(): void {
    this.registry.register(this)
  }

  async connect(_authCode: string): Promise<ConnectResult> {
    throw new Error('ThreadsProvider.connect() — not yet implemented')
  }

  async disconnect(_accountId: string): Promise<void> {
    throw new Error('ThreadsProvider.disconnect() — not yet implemented')
  }

  async publishPost(
    _accountId: string,
    _payload: PublishPostPayload,
  ): Promise<PublishedPostResult> {
    throw new Error('ThreadsProvider.publishPost() — not yet implemented')
  }

  async uploadMedia(
    _accountId: string,
    _fileBuffer: Buffer,
    _mimeType: string,
  ): Promise<UploadMediaResult> {
    throw new Error('ThreadsProvider.uploadMedia() — not yet implemented')
  }

  async deletePost(_accountId: string, _externalPostId: string): Promise<void> {
    throw new Error('ThreadsProvider.deletePost() — not yet implemented')
  }

  async getAnalytics(
    _accountId: string,
    _from: Date,
    _to: Date,
  ): Promise<AnalyticsResult> {
    throw new Error('ThreadsProvider.getAnalytics() — not yet implemented')
  }
}
