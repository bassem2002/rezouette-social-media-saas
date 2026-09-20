import { Readable } from 'node:stream'
import { of, throwError } from 'rxjs'
import { YouTubeResumableUploader } from './youtube-resumable-uploader.js'
import type { ResumableUploadOptions } from './youtube-resumable-uploader.js'
import { YouTubeContentError } from '../../../application/social/errors/youtube-content.error.js'

const SESSION_URL = 'https://upload.example.test/upload/youtube/v3/videos?upload_id=SECRET'
const ACCESS_TOKEN = 'fake-access-token'
const CHUNK = 256 * 1024

/// Flux mémorisant sa destruction, pour vérifier qu'aucun descripteur ne fuit.
class TrackedStream extends Readable {
  destroyed_ = false
  constructor(readonly range: [number, number]) {
    super()
    this.push(null)
  }
  override destroy(): this {
    this.destroyed_ = true
    return super.destroy()
  }
}

function makeUploader(totalSize = CHUNK * 2) {
  const streams: TrackedStream[] = []
  const mediaReader = {
    resolvePublicUrl: jest.fn(),
    openRange: jest.fn().mockImplementation(async (_ref, start, end) => {
      const stream = new TrackedStream([start, end])
      streams.push(stream)
      return stream
    }),
  }
  const http = { put: jest.fn() }
  const uploader = new YouTubeResumableUploader(http as never, mediaReader as never)

  const options: ResumableUploadOptions = {
    accessToken: ACCESS_TOKEN,
    sessionUrl: SESSION_URL,
    mediaRef: 'social/2026/08/clip.mp4',
    totalSize,
    mimeType: 'video/mp4',
    chunkSizeBytes: CHUNK,
    maxRetries: 3,
    // Backoff quasi nul : les tests ne doivent pas attendre réellement.
    retryBaseMs: 1,
    requestTimeoutMs: 1000,
  }
  return { uploader, http, mediaReader, streams, options }
}

function ok(videoId = 'yt-video-1', status = 200) {
  return of({ status, data: { id: videoId }, headers: {} })
}
function incomplete(lastByte: number) {
  return of({ status: 308, data: '', headers: { range: `bytes=0-${lastByte}` } })
}
function incompleteWithoutRange() {
  return of({ status: 308, data: '', headers: {} })
}
function serverError(status = 500, headers: Record<string, string> = {}) {
  return of({ status, data: { error: { message: 'oops' } }, headers })
}

/// Requêtes de transfert (avec corps) vs sondes (sans corps).
function chunkCalls(http: { put: jest.Mock }) {
  return http.put.mock.calls.filter((call) => call[1] !== undefined)
}
function probeCalls(http: { put: jest.Mock }) {
  return http.put.mock.calls.filter((call) => call[1] === undefined)
}

describe('YouTubeResumableUploader — transfert simple', () => {
  it('envoie un seul bloc et renvoie le videoId', async () => {
    const { uploader, http, options } = makeUploader(1000)
    http.put.mockReturnValueOnce(ok('yt-abc', 201))

    const result = await uploader.upload(options)

    expect(result).toEqual({ videoId: 'yt-abc' })
    expect(chunkCalls(http)).toHaveLength(1)
  })

  it('envoie des en-têtes de plage exacts', async () => {
    const { uploader, http, options } = makeUploader(1000)
    http.put.mockReturnValueOnce(ok())

    await uploader.upload(options)

    const [url, body, config] = http.put.mock.calls[0]
    expect(url).toBe(SESSION_URL)
    expect(config.headers['Content-Length']).toBe('1000')
    expect(config.headers['Content-Range']).toBe('bytes 0-999/1000')
    expect(config.headers['Content-Type']).toBe('video/mp4')
    expect(config.headers.Authorization).toBe(`Bearer ${ACCESS_TOKEN}`)
    expect(config.timeout).toBe(1000)
    // Le corps est un FLUX, jamais un Buffer.
    expect(Buffer.isBuffer(body)).toBe(false)
    expect(typeof (body as Readable).pipe).toBe('function')
  })

  it('demande exactement la plage du bloc au lecteur média', async () => {
    const { uploader, http, mediaReader, options } = makeUploader(1000)
    http.put.mockReturnValueOnce(ok())

    await uploader.upload(options)

    expect(mediaReader.openRange).toHaveBeenCalledWith(
      'social/2026/08/clip.mp4',
      0,
      999,
    )
  })

  it('accepte une réponse finale 200 comme 201', async () => {
    const { uploader, http, options } = makeUploader(500)
    http.put.mockReturnValueOnce(ok('yt-200', 200))

    await expect(uploader.upload(options)).resolves.toEqual({ videoId: 'yt-200' })
  })
})

describe('YouTubeResumableUploader — transfert multi-blocs', () => {
  it('enchaîne trois blocs, le dernier plus petit', async () => {
    const total = CHUNK * 2 + 100
    const { uploader, http, mediaReader, options } = makeUploader(total)
    http.put
      .mockReturnValueOnce(incomplete(CHUNK - 1))
      .mockReturnValueOnce(incomplete(CHUNK * 2 - 1))
      .mockReturnValueOnce(ok('yt-multi'))

    const result = await uploader.upload(options)

    expect(result.videoId).toBe('yt-multi')
    expect(mediaReader.openRange.mock.calls.map((c) => [c[1], c[2]])).toEqual([
      [0, CHUNK - 1],
      [CHUNK, CHUNK * 2 - 1],
      [CHUNK * 2, total - 1],
    ])
    // Plages contiguës, dernier bloc de 100 octets.
    const last = chunkCalls(http)[2][2]
    expect(last.headers['Content-Length']).toBe('100')
    expect(last.headers['Content-Range']).toBe(
      `bytes ${CHUNK * 2}-${total - 1}/${total}`,
    )
  })

  it('ouvre un NOUVEAU flux par bloc', async () => {
    const { uploader, http, streams, options } = makeUploader(CHUNK * 2)
    http.put.mockReturnValueOnce(incomplete(CHUNK - 1)).mockReturnValueOnce(ok())

    await uploader.upload(options)

    expect(streams).toHaveLength(2)
    expect(streams[0].range).toEqual([0, CHUNK - 1])
    expect(streams[1].range).toEqual([CHUNK, CHUNK * 2 - 1])
  })

  it('reprend depuis l’offset confirmé, même partiel', async () => {
    const { uploader, http, mediaReader, options } = makeUploader(CHUNK * 2)
    // Google n'a confirmé que la moitié du premier bloc.
    http.put.mockReturnValueOnce(incomplete(CHUNK / 2 - 1)).mockReturnValueOnce(ok())

    await uploader.upload(options)

    // Le bloc suivant repart de l'octet confirmé + 1, et conserve la taille de
    // bloc configurée (il ne saute pas jusqu'à la fin du fichier).
    expect(mediaReader.openRange.mock.calls[1].slice(1)).toEqual([
      CHUNK / 2,
      CHUNK / 2 + CHUNK - 1,
    ])
  })

  it('sonde quand l’en-tête Range est absent', async () => {
    const { uploader, http, options } = makeUploader(CHUNK * 2)
    http.put
      .mockReturnValueOnce(incompleteWithoutRange())
      .mockReturnValueOnce(incomplete(CHUNK - 1)) // sonde
      .mockReturnValueOnce(ok())

    await uploader.upload(options)

    expect(probeCalls(http)).toHaveLength(1)
    expect(probeCalls(http)[0][2].headers['Content-Range']).toBe(
      `bytes */${CHUNK * 2}`,
    )
  })

  it('sonde quand l’en-tête Range est malformé (aucune supposition)', async () => {
    const { uploader, http, options } = makeUploader(CHUNK * 2)
    http.put
      .mockReturnValueOnce(of({ status: 308, data: '', headers: { range: 'bytes=42' } }))
      .mockReturnValueOnce(incomplete(CHUNK - 1))
      .mockReturnValueOnce(ok())

    await uploader.upload(options)

    expect(probeCalls(http)).toHaveLength(1)
  })

  it('refuse une progression incohérente (offset qui recule)', async () => {
    const { uploader, http, options } = makeUploader(CHUNK * 3)
    http.put
      .mockReturnValueOnce(incomplete(CHUNK * 2 - 1))
      .mockReturnValueOnce(incomplete(CHUNK - 1)) // recul

    await expect(uploader.upload(options)).rejects.toMatchObject({
      youtube: { serviceErrorCode: 'upload_response_invalid' },
    })
  })
})

describe('YouTubeResumableUploader — sonde et reprise', () => {
  it('sonde puis reprend après une coupure réseau', async () => {
    const { uploader, http, mediaReader, options } = makeUploader(CHUNK * 2)
    http.put
      .mockReturnValueOnce(throwError(() => ({ code: 'ECONNRESET' })))
      .mockReturnValueOnce(incomplete(CHUNK - 1)) // sonde
      .mockReturnValueOnce(ok('yt-reprise'))

    const result = await uploader.upload(options)

    expect(result.videoId).toBe('yt-reprise')
    expect(probeCalls(http)).toHaveLength(1)
    // La reprise repart de l'offset CONFIRMÉ, pas du début du bloc perdu.
    expect(mediaReader.openRange.mock.calls[1].slice(1)).toEqual([
      CHUNK,
      CHUNK * 2 - 1,
    ])
  })

  it('sonde puis reprend après un 500', async () => {
    const { uploader, http, options } = makeUploader(CHUNK * 2)
    http.put
      .mockReturnValueOnce(serverError(500))
      .mockReturnValueOnce(incomplete(CHUNK - 1))
      .mockReturnValueOnce(ok())

    await expect(uploader.upload(options)).resolves.toEqual({ videoId: 'yt-video-1' })
    expect(probeCalls(http)).toHaveLength(1)
  })

  it('respecte Retry-After sur un 503', async () => {
    const { uploader, http, options } = makeUploader(CHUNK * 2)
    http.put
      .mockReturnValueOnce(serverError(503, { 'retry-after': '0' }))
      .mockReturnValueOnce(incomplete(CHUNK - 1))
      .mockReturnValueOnce(ok())

    await expect(uploader.upload(options)).resolves.toBeDefined()
  })

  it('sonde après un timeout', async () => {
    const { uploader, http, options } = makeUploader(CHUNK * 2)
    http.put
      .mockReturnValueOnce(throwError(() => ({ code: 'ECONNABORTED', message: 'timeout' })))
      .mockReturnValueOnce(incomplete(CHUNK - 1))
      .mockReturnValueOnce(ok())

    await expect(uploader.upload(options)).resolves.toBeDefined()
  })

  it('reprend depuis 0 quand la sonde ne confirme aucun octet', async () => {
    const { uploader, http, mediaReader, options } = makeUploader(CHUNK)
    http.put
      .mockReturnValueOnce(throwError(() => ({ code: 'ECONNRESET' })))
      .mockReturnValueOnce(incompleteWithoutRange()) // sonde : rien de confirmé
      .mockReturnValueOnce(ok())

    await uploader.upload(options)

    expect(mediaReader.openRange.mock.calls[1].slice(1)).toEqual([0, CHUNK - 1])
  })

  it('conclut sans renvoyer d’octets si la sonde indique un upload terminé', async () => {
    const { uploader, http, mediaReader, options } = makeUploader(CHUNK * 2)
    http.put
      .mockReturnValueOnce(throwError(() => ({ code: 'ECONNRESET' })))
      .mockReturnValueOnce(ok('yt-deja-fini')) // sonde : déjà terminé

    const result = await uploader.upload(options)

    expect(result.videoId).toBe('yt-deja-fini')
    // Un seul bloc a été ouvert : aucun octet retransmis inutilement.
    expect(mediaReader.openRange).toHaveBeenCalledTimes(1)
  })

  it('signale une session expirée (404)', async () => {
    const { uploader, http, options } = makeUploader(CHUNK)
    http.put
      .mockReturnValueOnce(throwError(() => ({ code: 'ECONNRESET' })))
      .mockReturnValueOnce(of({ status: 404, data: {}, headers: {} }))

    await expect(uploader.upload(options)).rejects.toMatchObject({
      youtube: { serviceErrorCode: 'upload_session_expired' },
    })
  })

  it('épuise le budget de reprises sans prétendre à un échec définitif', async () => {
    const { uploader, http, options } = makeUploader(CHUNK)
    options.maxRetries = 1
    http.put
      .mockReturnValueOnce(throwError(() => ({ code: 'ECONNRESET' })))
      .mockReturnValueOnce(incompleteWithoutRange())
      .mockReturnValueOnce(throwError(() => ({ code: 'ECONNRESET' })))

    try {
      await uploader.upload(options)
      throw new Error('aurait dû lever')
    } catch (err) {
      const payload = (err as YouTubeContentError).youtube
      expect(payload.serviceErrorCode).toBe('upload_interrupted')
      // Message prudent : l'état réel est inconnu, pas « échec ».
      expect(payload.message).toMatch(/indéterminé|vérifiez/i)
    }
  })

  it('n’ouvre JAMAIS le fichier média pour une sonde', async () => {
    const { uploader, http, mediaReader, options } = makeUploader(CHUNK * 2)
    http.put
      .mockReturnValueOnce(throwError(() => ({ code: 'ECONNRESET' })))
      .mockReturnValueOnce(incomplete(CHUNK - 1))
      .mockReturnValueOnce(ok())

    await uploader.upload(options)

    // 2 blocs envoyés = 2 ouvertures ; la sonde n'en ajoute aucune.
    expect(mediaReader.openRange).toHaveBeenCalledTimes(2)
    expect(probeCalls(http)[0][1]).toBeUndefined()
  })

  it('ne réessaie PAS une erreur permanente 4xx', async () => {
    const { uploader, http, options } = makeUploader(CHUNK)
    http.put.mockReturnValueOnce(
      of({
        status: 403,
        data: { error: { errors: [{ reason: 'quotaExceeded' }] } },
        headers: {},
      }),
    )

    await expect(uploader.upload(options)).rejects.toMatchObject({
      youtube: { httpStatus: 403, googleReason: 'quotaExceeded' },
    })
    expect(http.put).toHaveBeenCalledTimes(1)
  })
})

describe('YouTubeResumableUploader — réponse finale', () => {
  it.each([
    ['id absent', {}],
    ['id vide', { id: '   ' }],
    ['id numérique', { id: 42 }],
    ['corps non objet', 'ok'],
  ])('refuse une réponse finale sans id exploitable (%s)', async (_label, data) => {
    const { uploader, http, options } = makeUploader(CHUNK)
    http.put.mockReturnValueOnce(of({ status: 200, data, headers: {} }))

    await expect(uploader.upload(options)).rejects.toMatchObject({
      youtube: { serviceErrorCode: 'upload_response_invalid' },
    })
  })
})

describe('YouTubeResumableUploader — hygiène', () => {
  it('détruit le flux après un succès', async () => {
    const { uploader, http, streams, options } = makeUploader(CHUNK)
    http.put.mockReturnValueOnce(ok())

    await uploader.upload(options)

    expect(streams[0].destroyed_).toBe(true)
  })

  it('détruit le flux après une erreur', async () => {
    const { uploader, http, streams, options } = makeUploader(CHUNK)
    options.maxRetries = 0
    http.put.mockReturnValueOnce(throwError(() => ({ code: 'ECONNRESET' })))

    await expect(uploader.upload(options)).rejects.toThrow()

    expect(streams[0].destroyed_).toBe(true)
  })

  it("n'expose ni token, ni URI de session, ni chemin local dans les erreurs", async () => {
    const { uploader, http, options } = makeUploader(CHUNK)
    http.put.mockReturnValueOnce(
      of({
        status: 400,
        data: { error: { message: `échec ${SESSION_URL}` , errors: [{ reason: 'badRequest' }] } },
        headers: {},
      }),
    )

    try {
      await uploader.upload(options)
      throw new Error('aurait dû lever')
    } catch (err) {
      const dump = `${(err as Error).message} ${JSON.stringify(
        (err as YouTubeContentError).youtube,
      )}`
      expect(dump).not.toContain(ACCESS_TOKEN)
      expect(dump).not.toContain('upload_id')
      expect(dump).not.toContain(SESSION_URL)
      expect(dump).not.toContain('social/2026/08/clip.mp4')
    }
  })

  it('ne bufferise jamais la vidéo (maxBodyLength illimité, corps en flux)', async () => {
    const { uploader, http, options } = makeUploader(CHUNK)
    http.put.mockReturnValueOnce(ok())

    await uploader.upload(options)

    const config = chunkCalls(http)[0][2]
    expect(config.maxBodyLength).toBe(Infinity)
    expect(config.responseType).toBe('json')
  })
})
