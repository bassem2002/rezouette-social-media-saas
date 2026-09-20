export interface UploadOptions {
  folder?: string
  publicId?: string
  tags?: string[]
}

export interface StoredMedia {
  url: string
  secureUrl: string
  publicId: string
  format: string
  bytes: number
}

export interface MediaStoragePort {
  upload(
    fileBuffer: Buffer,
    mimeType: string,
    options?: UploadOptions,
  ): Promise<StoredMedia>

  delete(publicId: string): Promise<void>

  getUrl(publicId: string, transformations?: Record<string, unknown>): string
}
