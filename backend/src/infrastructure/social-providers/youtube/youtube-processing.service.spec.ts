import { of, throwError } from 'rxjs'
import { YouTubeProcessingService } from './youtube-processing.service.js'
import { YouTubeContentError } from '../../../application/social/errors/youtube-content.error.js'
import type { YouTubeConfig } from '../../../config/youtube.config.js'

const API_BASE = 'https://www.googleapis.test/youtube/v3'
const VIDEO_ID = 'yt-video-1'
const ACCESS_TOKEN = 'fake-access-token'

const CONFIGURED = {
  clientId: 'fake-client-id',
  clientSecret: 'fake-client-secret',
  redirectUri: 'https://app.example.test/callback',
  apiBaseUrl: API_BASE,
  reconcileRequestTimeoutMs: 30_000,
} as YouTubeConfig

function makeService(config: Partial<YouTubeConfig> = {}) {
  const http = { get: jest.fn() }
  const configService = {
    getOrThrow: () => ({ ...CONFIGURED, ...config }),
  } as never
  return { service: new YouTubeProcessingService(http as never, configService), http }
}

function videoItem(
  status: Record<string, unknown> = {},
  processingDetails: Record<string, unknown> = {},
) {
  return of({
    status: 200,
    data: { items: [{ id: VIDEO_ID, status, processingDetails }] },
    headers: {},
  })
}

function query(service: YouTubeProcessingService) {
  return service.getVideoProcessingStatus({
    accessToken: ACCESS_TOKEN,
    videoId: VIDEO_ID,
  })
}

function codeOf(err: unknown): string {
  return (err as YouTubeContentError).youtube.serviceErrorCode
}

describe('YouTubeProcessingService — garde et requête', () => {
  it('lève 503 sans configuration, sans aucun appel HTTP', async () => {
    const { service, http } = makeService({ clientId: '' })

    await expect(query(service)).rejects.toMatchObject({
      youtube: { serviceErrorCode: 'publishing_not_configured', httpStatus: 503 },
    })
    expect(http.get).not.toHaveBeenCalled()
  })

  it('interroge videos.list avec les paramètres exacts', async () => {
    const { service, http } = makeService()
    http.get.mockReturnValue(videoItem({ uploadStatus: 'processed' }))

    await query(service)

    const [url, config] = http.get.mock.calls[0]
    expect(url).toBe(`${API_BASE}/videos`)
    expect(config.params).toEqual({
      part: 'status,processingDetails',
      id: VIDEO_ID,
    })
    expect(config.headers.Authorization).toBe(`Bearer ${ACCESS_TOKEN}`)
    expect(config.timeout).toBe(30_000)
  })

  it("n'envoie ni maxResults, ni parts coûteuses, ni corps", async () => {
    const { service, http } = makeService()
    http.get.mockReturnValue(videoItem({ uploadStatus: 'processed' }))

    await query(service)

    const [, config] = http.get.mock.calls[0]
    const params = config.params as Record<string, string>
    expect(params['maxResults']).toBeUndefined()
    expect(params['onBehalfOfContentOwner']).toBeUndefined()
    expect(params.part).not.toContain('fileDetails')
    expect(params.part).not.toContain('statistics')
    expect(params.part).not.toContain('suggestions')
    // `http.get` n'a que (url, config) : aucun corps possible.
    expect(http.get.mock.calls[0]).toHaveLength(2)
  })
})

describe('YouTubeProcessingService — classification', () => {
  it.each([
    ['processingStatus processing', {}, { processingStatus: 'processing' }, 'processing'],
    ['uploadStatus uploaded', { uploadStatus: 'uploaded' }, {}, 'processing'],
    ['processingStatus succeeded', {}, { processingStatus: 'succeeded' }, 'succeeded'],
    ['uploadStatus processed seul', { uploadStatus: 'processed' }, {}, 'succeeded'],
    ['uploadStatus failed', { uploadStatus: 'failed' }, {}, 'failed'],
    ['processingStatus failed', {}, { processingStatus: 'failed' }, 'failed'],
    ['uploadStatus rejected', { uploadStatus: 'rejected' }, {}, 'rejected'],
    ['uploadStatus deleted', { uploadStatus: 'deleted' }, {}, 'deleted'],
    ['processingStatus terminated', { uploadStatus: 'uploaded' }, { processingStatus: 'terminated' }, 'processing'],
    ['terminated seul', {}, { processingStatus: 'terminated' }, 'terminated'],
  ])('%s → %s', async (_label, status, details, expected) => {
    const { service, http } = makeService()
    http.get.mockReturnValue(videoItem(status, details))

    await expect(query(service)).resolves.toMatchObject({ status: expected })
  })

  it('un rejet prime sur un processing succeeded contradictoire', async () => {
    const { service, http } = makeService()
    http.get.mockReturnValue(
      videoItem(
        { uploadStatus: 'rejected', rejectionReason: 'copyright' },
        { processingStatus: 'succeeded' },
      ),
    )

    const result = await query(service)
    expect(result.status).toBe('rejected')
    expect(result.rejectionReason).toBe('copyright')
  })

  it('un échec d’upload prime sur un processing succeeded contradictoire', async () => {
    const { service, http } = makeService()
    http.get.mockReturnValue(
      videoItem({ uploadStatus: 'failed' }, { processingStatus: 'succeeded' }),
    )

    await expect(query(service)).resolves.toMatchObject({ status: 'failed' })
  })

  it('extrait failureReason et rejectionReason autorisés', async () => {
    const { service, http } = makeService()
    http.get.mockReturnValue(
      videoItem({ uploadStatus: 'failed', failureReason: 'invalidFile' }),
    )

    await expect(query(service)).resolves.toMatchObject({
      status: 'failed',
      failureReason: 'invalidFile',
    })
  })

  it('retombe sur processingFailureReason quand failureReason est absent', async () => {
    const { service, http } = makeService()
    http.get.mockReturnValue(
      videoItem(
        {},
        { processingStatus: 'failed', processingFailureReason: 'transcodeFailed' },
      ),
    )

    await expect(query(service)).resolves.toMatchObject({
      failureReason: 'transcodeFailed',
    })
  })

  it('remplace un motif hors nomenclature par « unknown »', async () => {
    const { service, http } = makeService()
    http.get.mockReturnValue(
      videoItem({ uploadStatus: 'failed', failureReason: 'motif-exotique-<script>' }),
    )

    const result = await query(service)
    expect(result.failureReason).toBe('unknown')
    expect(JSON.stringify(result)).not.toContain('script')
  })

  it('extrait la progression sans autre champ', async () => {
    const { service, http } = makeService()
    http.get.mockReturnValue(
      videoItem(
        { uploadStatus: 'uploaded' },
        {
          processingStatus: 'processing',
          processingProgress: {
            partsProcessed: '3',
            partsTotal: '10',
            timeLeftMs: '5000',
            secretInterne: 'ne-doit-pas-passer',
          },
        },
      ),
    )

    const result = await query(service)
    expect(result.progress).toEqual({
      partsProcessed: '3',
      partsTotal: '10',
      timeLeftMs: '5000',
    })
    expect(JSON.stringify(result)).not.toContain('secretInterne')
  })

  it('ignore un uploadStatus hors nomenclature', async () => {
    const { service, http } = makeService()
    http.get.mockReturnValue(
      videoItem({ uploadStatus: 'inventé' }, { processingStatus: 'processing' }),
    )

    const result = await query(service)
    expect(result.status).toBe('processing')
    expect(result.uploadStatus).toBeUndefined()
  })
})

describe('YouTubeProcessingService — réponses invalides', () => {
  it('lève video_not_found sur une liste vide', async () => {
    const { service, http } = makeService()
    http.get.mockReturnValue(of({ status: 200, data: { items: [] }, headers: {} }))

    await expect(query(service)).rejects.toMatchObject({
      youtube: { serviceErrorCode: 'video_not_found' },
    })
  })

  it('lève video_not_found si l’id retourné diffère', async () => {
    const { service, http } = makeService()
    http.get.mockReturnValue(
      of({ status: 200, data: { items: [{ id: 'autre-video' }] }, headers: {} }),
    )

    await expect(query(service)).rejects.toMatchObject({
      youtube: { serviceErrorCode: 'video_not_found' },
    })
  })

  it.each([
    ['items absent', { data: {} }],
    ['items non tableau', { data: { items: 'x' } }],
    ['data non objet', { data: 'x' }],
  ])('lève processing_response_invalid (%s)', async (_label, payload) => {
    const { service, http } = makeService()
    http.get.mockReturnValue(of({ status: 200, ...payload, headers: {} }))

    await expect(query(service)).rejects.toMatchObject({
      youtube: { serviceErrorCode: 'processing_response_invalid' },
    })
  })

  it('lève processing_response_invalid sur une combinaison inconnue', async () => {
    const { service, http } = makeService()
    http.get.mockReturnValue(videoItem({}, {}))

    await expect(query(service)).rejects.toMatchObject({
      youtube: { serviceErrorCode: 'processing_response_invalid' },
    })
  })
})

describe('YouTubeProcessingService — erreurs HTTP', () => {
  function googleError(status: number, reason?: string) {
    return of({
      status,
      data: { error: { code: status, ...(reason ? { errors: [{ reason }] } : {}) } },
      headers: {},
    })
  }

  it.each([
    [401, undefined, 'processing_permission_denied'],
    [403, 'insufficientPermissions', 'processing_permission_denied'],
    [403, 'quotaExceeded', 'processing_rate_limited'],
    [404, undefined, 'video_not_found'],
    [429, undefined, 'processing_rate_limited'],
    [500, undefined, 'processing_request_failed'],
    [503, undefined, 'processing_request_failed'],
  ])('HTTP %s (%s) → %s', async (status, reason, expected) => {
    const { service, http } = makeService()
    http.get.mockReturnValue(googleError(status, reason))

    try {
      await query(service)
      throw new Error('aurait dû lever')
    } catch (err) {
      expect(codeOf(err)).toBe(expected)
    }
  })

  it('timeout → processing_timeout', async () => {
    const { service, http } = makeService()
    http.get.mockReturnValue(
      throwError(() => ({ code: 'ECONNABORTED', message: 'timeout of 30000ms' })),
    )

    await expect(query(service)).rejects.toMatchObject({
      youtube: { serviceErrorCode: 'processing_timeout' },
    })
  })

  it('incident réseau → processing_timeout', async () => {
    const { service, http } = makeService()
    http.get.mockReturnValue(throwError(() => ({ code: 'ECONNRESET' })))

    await expect(query(service)).rejects.toMatchObject({
      youtube: { serviceErrorCode: 'processing_timeout' },
    })
  })

  it("n'expose ni token, ni videoId, ni corps brut dans les erreurs", async () => {
    const { service, http } = makeService()
    http.get.mockReturnValue(
      of({
        status: 500,
        data: {
          error: {
            code: 500,
            message: `détail interne ${VIDEO_ID}`,
            errors: [{ reason: 'backendError' }],
          },
          access_token: 'ne-doit-pas-fuiter',
        },
        headers: {},
      }),
    )

    try {
      await query(service)
      throw new Error('aurait dû lever')
    } catch (err) {
      const dump = `${(err as Error).message} ${JSON.stringify(
        (err as YouTubeContentError).youtube,
      )}`
      expect(dump).not.toContain(ACCESS_TOKEN)
      expect(dump).not.toContain('ne-doit-pas-fuiter')
      expect(dump).not.toContain(VIDEO_ID)
    }
  })
})
