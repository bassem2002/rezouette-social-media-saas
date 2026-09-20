export type SocialPlatform =
  | 'facebook'
  | 'instagram'
  | 'linkedin'
  | 'tiktok'
  | 'youtube'
  | 'threads'

export interface PublishPostPayload {
  content: string
  mediaUrls?: string[]
  scheduledAt?: Date
}

export interface PublishedPostResult {
  externalId: string
  url: string
  publishedAt: Date
}

export interface AnalyticsResult {
  views: number
  likes: number
  comments: number
  shares: number
  reach: number
  period: { from: Date; to: Date }
}

export interface UploadMediaResult {
  url: string
  externalMediaId?: string
}

export interface ConnectResult {
  accessToken: string
  refreshToken?: string
  expiresAt?: Date
  accountId: string
  accountName: string
}

export interface SocialProviderPort {
  readonly platform: SocialPlatform

  connect(authCode: string): Promise<ConnectResult>

  disconnect(accountId: string): Promise<void>

  publishPost(
    accountId: string,
    payload: PublishPostPayload,
  ): Promise<PublishedPostResult>

  uploadMedia(
    accountId: string,
    fileBuffer: Buffer,
    mimeType: string,
  ): Promise<UploadMediaResult>

  deletePost(accountId: string, externalPostId: string): Promise<void>

  getAnalytics(
    accountId: string,
    from: Date,
    to: Date,
  ): Promise<AnalyticsResult>
}
