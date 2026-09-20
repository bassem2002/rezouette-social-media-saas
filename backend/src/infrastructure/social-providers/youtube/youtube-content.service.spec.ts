import { of, throwError } from 'rxjs'
import { YouTubeContentService } from './youtube-content.service.js'
import {
  DisabledYouTubeContentService,
  youtubeContentGatewayProvider,
} from './youtube-content.factory.js'
import { MediaAccessError, MediaAccessErrorCode } from '../../../application/media/errors/media-access.error.js'
import { YouTubeContentError } from '../../../application/social/errors/youtube-content.error.js'
import type { YouTubeConfig } from '../../../config/youtube.config.js'
import type { PublishYouTubeVideoInput } from '../../../application/social/ports/youtube-content.gateway.js'

const UPLOAD_BASE = 'https://upload.example.test/upload/youtube/v3'
const SESSION_URL = `${UPLOAD_BASE}/videos?upload_id=SECRET`

const BASE_CONFIG = {
  clientId: 'fake-client-id',
  clientSecret: 'fake-client-secret',
  redirectUri: 'https://app.example.test/callback',
  uploadBaseUrl: UPLOAD_BASE,
  publishingEnabled: true,
  uploadChunkSizeBytes: 256 * 1024,
  uploadMaxRetries: 3,
  uploadRetryBaseMs: 1,
  uploadRequestTimeoutMs: 1000,
} as YouTubeConfig

const MEDIA = {
  ref: 'social/2026/08/clip.mp4',
  size: 2048,
  mimeType: 'video/mp4',
  filename: 'clip.mp4',
}

function input(
  overrides: Partial<PublishYouTubeVideoInput> = {},
): PublishYouTubeVideoInput {
  return {
    accessToken: 'fake-access-token',
    channelId: 'UC_channel_1',
    videoUrl: 'https://api.zernio.test/uploads/social/2026/08/clip.mp4',
    title: 'Ma vidéo',
    privacyStatus: 'private',
    madeForKids: false,
    ...overrides,
  }
}

function makeService(
  config: Partial<YouTubeConfig> = {},
  media: unknown = MEDIA,
) {
  const http = { post: jest.fn(), put: jest.fn() }
  const mediaReader = {
    resolvePublicUrl:
      media instanceof Error
        ? jest.fn().mockRejectedValue(media)
        : jest.fn().mockResolvedValue(media),
    openRange: jest.fn(),
  }
  const uploader = { upload: jest.fn().mockResolvedValue({ videoId: 'yt-video-1' }) }
  const configService = {
    getOrThrow: () => ({ ...BASE_CONFIG, ...config }),
  } as never

  return {
    service: new YouTubeContentService(
      http as never,
      configService,
      mediaReader as never,
      uploader as never,
    ),
    http,
    mediaReader,
    uploader,
  }
}

function sessionCreated(location = SESSION_URL) {
  return of({ status: 200, data: {}, headers: { location } })
}

describe('YouTubeContentService — gardes', () => {
  it('refuse quand la publication est désactivée, sans toucher au média', async () => {
    const { service, mediaReader, http } = makeService({ publishingEnabled: false })

    await expect(service.publishVideo(input())).rejects.toMatchObject({
      youtube: { serviceErrorCode: 'publishing_not_configured' },
    })
    expect(mediaReader.resolvePublicUrl).not.toHaveBeenCalled()
    expect(http.post).not.toHaveBeenCalled()
  })

  it('refuse quand les credentials sont absents, même flag levé', async () => {
    const { service, http } = makeService({ clientId: '', publishingEnabled: true })

    await expect(service.publishVideo(input())).rejects.toMatchObject({
      youtube: { serviceErrorCode: 'publishing_not_configured' },
    })
    expect(http.post).not.toHaveBeenCalled()
  })
})

describe('YouTubeContentService — validation du média', () => {
  it('refuse une URL non gérée par Zernio, AVANT tout appel réseau', async () => {
    const { service, http, uploader } = makeService(
      {},
      new MediaAccessError(
        MediaAccessErrorCode.MEDIA_NOT_MANAGED_BY_ZERNIO,
        "Le média n'est pas un fichier hébergé par Zernio.",
      ),
    )

    await expect(service.publishVideo(input())).rejects.toMatchObject({
      youtube: { serviceErrorCode: 'media_not_managed_by_zernio' },
    })
    expect(http.post).not.toHaveBeenCalled()
    expect(uploader.upload).not.toHaveBeenCalled()
  })

  it('refuse un média qui n’est pas une vidéo', async () => {
    const { service, http } = makeService({}, { ...MEDIA, mimeType: 'image/jpeg' })

    await expect(service.publishVideo(input())).rejects.toMatchObject({
      youtube: { serviceErrorCode: 'invalid_media_type' },
    })
    expect(http.post).not.toHaveBeenCalled()
  })

  it('refuse un média vide', async () => {
    const { service, http } = makeService({}, { ...MEDIA, size: 0 })

    await expect(service.publishVideo(input())).rejects.toMatchObject({
      youtube: { serviceErrorCode: 'empty_media' },
    })
    expect(http.post).not.toHaveBeenCalled()
  })
})

describe('YouTubeContentService — création de session', () => {
  it('poste avec les paramètres et en-têtes attendus', async () => {
    const { service, http } = makeService()
    http.post.mockReturnValue(sessionCreated())

    await service.publishVideo(input())

    const [url, body, config] = http.post.mock.calls[0]
    const parsed = new URL(url as string)
    expect(parsed.origin + parsed.pathname).toBe(`${UPLOAD_BASE}/videos`)
    expect(parsed.searchParams.get('uploadType')).toBe('resumable')
    expect(parsed.searchParams.get('part')).toBe('snippet,status')
    expect(config.headers['X-Upload-Content-Length']).toBe('2048')
    expect(config.headers['X-Upload-Content-Type']).toBe('video/mp4')
    expect(config.headers['Content-Type']).toBe('application/json; charset=UTF-8')
    expect(config.headers.Authorization).toBe('Bearer fake-access-token')
    expect(body).toEqual({
      snippet: { title: 'Ma vidéo' },
      status: { privacyStatus: 'private', selfDeclaredMadeForKids: false },
    })
  })

  it('n’envoie pas de paramètres CMS ni le channelId en query', async () => {
    const { service, http } = makeService()
    http.post.mockReturnValue(sessionCreated())

    await service.publishVideo(input())

    const parsed = new URL(http.post.mock.calls[0][0] as string)
    expect(parsed.searchParams.get('onBehalfOfContentOwner')).toBeNull()
    expect(parsed.searchParams.get('onBehalfOfContentOwnerChannel')).toBeNull()
    expect(parsed.searchParams.get('channelId')).toBeNull()
    expect(JSON.stringify(http.post.mock.calls[0][1])).not.toContain('UC_channel_1')
  })

  it('transmet notifySubscribers en query quand il est fourni', async () => {
    const { service, http } = makeService()
    http.post.mockReturnValue(sessionCreated())

    await service.publishVideo(input({ notifySubscribers: false }))

    expect(
      new URL(http.post.mock.calls[0][0] as string).searchParams.get(
        'notifySubscribers',
      ),
    ).toBe('false')
  })

  it('omet les propriétés absentes et les tags vides', async () => {
    const { service, http } = makeService()
    http.post.mockReturnValue(sessionCreated())

    await service.publishVideo(input({ tags: ['   ', ''] }))

    const body = http.post.mock.calls[0][1] as Record<string, unknown>
    expect(body).toEqual({
      snippet: { title: 'Ma vidéo' },
      status: { privacyStatus: 'private', selfDeclaredMadeForKids: false },
    })
    expect(JSON.stringify(body)).not.toContain('undefined')
    expect(JSON.stringify(body)).not.toContain('"tags"')
  })

  it('transmet toutes les métadonnées fournies', async () => {
    const { service, http } = makeService()
    http.post.mockReturnValue(sessionCreated())

    await service.publishVideo(
      input({
        description: 'Description',
        tags: ['zernio', 'saas'],
        categoryId: '22',
        privacyStatus: 'unlisted',
        madeForKids: true,
        containsSyntheticMedia: true,
      }),
    )

    expect(http.post.mock.calls[0][1]).toEqual({
      snippet: {
        title: 'Ma vidéo',
        description: 'Description',
        tags: ['zernio', 'saas'],
        categoryId: '22',
      },
      status: {
        privacyStatus: 'unlisted',
        selfDeclaredMadeForKids: true,
        containsSyntheticMedia: true,
      },
    })
  })

  it('refuse une session sans en-tête Location', async () => {
    const { service, http, uploader } = makeService()
    http.post.mockReturnValue(of({ status: 200, data: {}, headers: {} }))

    await expect(service.publishVideo(input())).rejects.toMatchObject({
      youtube: { serviceErrorCode: 'upload_session_location_missing' },
    })
    expect(uploader.upload).not.toHaveBeenCalled()
  })

  it.each([
    ['http', 'http://upload.example.test/upload/youtube/v3/videos?upload_id=X'],
    ['autre origine', 'https://evil.test/upload?upload_id=X'],
    ['URL invalide', 'pas-une-url'],
  ])('refuse une Location %s', async (_label, location) => {
    const { service, http, uploader } = makeService()
    http.post.mockReturnValue(sessionCreated(location))

    await expect(service.publishVideo(input())).rejects.toMatchObject({
      youtube: { serviceErrorCode: 'upload_session_location_invalid' },
    })
    expect(uploader.upload).not.toHaveBeenCalled()
  })

  it('normalise un refus Google en erreur sûre', async () => {
    const { service, http } = makeService()
    http.post.mockReturnValue(
      of({
        status: 403,
        data: { error: { errors: [{ reason: 'quotaExceeded' }] } },
        headers: {},
      }),
    )

    await expect(service.publishVideo(input())).rejects.toMatchObject({
      youtube: { httpStatus: 403, googleReason: 'quotaExceeded' },
    })
  })

  it('normalise un incident réseau à la création', async () => {
    const { service, http } = makeService()
    http.post.mockReturnValue(throwError(() => ({ code: 'ECONNRESET' })))

    await expect(service.publishVideo(input())).rejects.toMatchObject({
      youtube: { serviceErrorCode: 'upload_session_creation_failed' },
    })
  })
})

describe('YouTubeContentService — transfert et résultat', () => {
  it('délègue le transfert avec les paramètres de configuration', async () => {
    const { service, http, uploader } = makeService()
    http.post.mockReturnValue(sessionCreated())

    await service.publishVideo(input())

    expect(uploader.upload).toHaveBeenCalledWith({
      accessToken: 'fake-access-token',
      sessionUrl: SESSION_URL,
      mediaRef: 'social/2026/08/clip.mp4',
      totalSize: 2048,
      mimeType: 'video/mp4',
      chunkSizeBytes: 256 * 1024,
      maxRetries: 3,
      retryBaseMs: 1,
      requestTimeoutMs: 1000,
    })
  })

  it('renvoie TOUJOURS processing après un upload réussi', async () => {
    const { service, http } = makeService()
    http.post.mockReturnValue(sessionCreated())

    await expect(service.publishVideo(input())).resolves.toEqual({
      videoId: 'yt-video-1',
      processingState: 'processing',
    })
  })

  it("n'expose ni token ni URI de session dans une erreur de session", async () => {
    const { service, http } = makeService()
    http.post.mockReturnValue(sessionCreated('http://evil.test/x?upload_id=SECRET'))

    try {
      await service.publishVideo(input())
      throw new Error('aurait dû lever')
    } catch (err) {
      const dump = `${(err as Error).message} ${JSON.stringify(
        (err as YouTubeContentError).youtube,
      )}`
      expect(dump).not.toContain('fake-access-token')
      expect(dump).not.toContain('upload_id')
      expect(dump).not.toContain('SECRET')
    }
  })
})

describe('youtubeContentGatewayProvider — sélection', () => {
  const real = { publishVideo: jest.fn() } as never
  const disabled = new DisabledYouTubeContentService()

  function select(config: Partial<YouTubeConfig>) {
    const configService = {
      getOrThrow: () => ({ ...BASE_CONFIG, ...config }),
    } as never
    const factory = (
      youtubeContentGatewayProvider as {
        useFactory: (c: unknown, r: unknown, d: unknown) => unknown
      }
    ).useFactory
    return factory(configService, real, disabled)
  }

  it('flag baissé → adaptateur désactivé', () => {
    expect(select({ publishingEnabled: false })).toBe(disabled)
  })

  it('credentials absents malgré le flag → adaptateur désactivé', () => {
    expect(select({ clientId: '', publishingEnabled: true })).toBe(disabled)
    expect(select({ clientSecret: '', publishingEnabled: true })).toBe(disabled)
    expect(select({ redirectUri: '', publishingEnabled: true })).toBe(disabled)
  })

  it('credentials complets et flag levé → service réel', () => {
    expect(select({ publishingEnabled: true })).toBe(real)
  })
})
