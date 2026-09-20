import { Readable } from 'node:stream'
import { of, throwError } from 'rxjs'
import {
  TikTokFileUploader,
  planTikTokChunks,
  type TikTokUploadOptions,
} from './tiktok-file-uploader.js'
import { TikTokContentError } from '../../../application/social/errors/tiktok-content.error.js'

const UPLOAD_URL = 'https://open-upload.tiktokapis.com/upload/?token=SECRET'
const MB = 1024 * 1024

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

function makeUploader(totalSize: number) {
  const streams: TrackedStream[] = []
  const mediaReader = {
    resolvePublicUrl: jest.fn(),
    openRange: jest.fn().mockImplementation(async (_ref, start, end) => {
      const stream = new TrackedStream([start, end])
      streams.push(stream)
      return stream
    }),
  }
  const http = { put: jest.fn().mockReturnValue(of({ status: 201, data: '' })) }
  const uploader = new TikTokFileUploader(http as never, mediaReader as never)

  const options: TikTokUploadOptions = {
    uploadUrl: UPLOAD_URL,
    mediaRef: 'social/2026/08/clip.mp4',
    totalSize,
    mimeType: 'video/mp4',
    plan: planTikTokChunks(totalSize),
  }
  return { uploader, http, mediaReader, streams, options }
}

/// En-tête Content-Range de chaque PUT, dans l'ordre d'envoi.
function sentRanges(http: { put: jest.Mock }): string[] {
  return http.put.mock.calls.map((call) => call[2].headers['Content-Range'])
}

describe('planTikTokChunks', () => {
  it('emballe un fichier sous le plancher de 5 Mo en un morceau unique', () => {
    // TikTok tolère un chunk_size sous le minimum quand il couvre tout le fichier.
    expect(planTikTokChunks(2 * MB)).toEqual({
      chunkSize: 2 * MB,
      totalChunkCount: 1,
    })
  })

  it('applique la division ENTIÈRE : le reste va au dernier morceau', () => {
    // 25 Mo à 10 Mo le morceau → 2 morceaux (et non 3) ; le second en pèsera 15.
    expect(planTikTokChunks(25 * MB)).toEqual({
      chunkSize: 10 * MB,
      totalChunkCount: 2,
    })
  })

  it('reste sous le plafond de 1000 morceaux sur un très gros fichier', () => {
    const plan = planTikTokChunks(20_000 * MB)
    expect(plan.totalChunkCount).toBeLessThanOrEqual(1000)
    expect(plan.chunkSize).toBeLessThanOrEqual(64 * MB)
  })

  it('refuse une taille nulle ou incohérente', () => {
    expect(() => planTikTokChunks(0)).toThrow(TikTokContentError)
    expect(() => planTikTokChunks(-1)).toThrow(TikTokContentError)
  })
})

describe('TikTokFileUploader', () => {
  it('couvre exactement le fichier, le dernier morceau absorbant le reste', async () => {
    const { uploader, http, options } = makeUploader(25 * MB)
    await uploader.upload(options)

    // Deux morceaux, et le second court jusqu'au dernier octet du fichier.
    expect(sentRanges(http)).toEqual([
      `bytes 0-${10 * MB - 1}/${25 * MB}`,
      `bytes ${10 * MB}-${25 * MB - 1}/${25 * MB}`,
    ])
  })

  it("n'attache aucun Authorization : l'URL de dépôt est déjà signée", async () => {
    const { uploader, http, options } = makeUploader(2 * MB)
    await uploader.upload(options)

    const headers = http.put.mock.calls[0][2].headers
    expect(headers.Authorization).toBeUndefined()
    expect(headers['Content-Type']).toBe('video/mp4')
    expect(headers['Content-Length']).toBe(String(2 * MB))
  })

  it('referme chaque flux, y compris après un échec', async () => {
    const { uploader, http, options, streams } = makeUploader(2 * MB)
    http.put.mockReturnValue(of({ status: 400, data: '' }))

    await expect(uploader.upload(options)).rejects.toThrow(TikTokContentError)
    expect(streams).toHaveLength(1)
    expect(streams[0].destroyed_).toBe(true)
  })

  it('rejette un refus 4xx sans réessayer', async () => {
    const { uploader, http, options } = makeUploader(2 * MB)
    http.put.mockReturnValue(of({ status: 403, data: '' }))

    await expect(uploader.upload(options)).rejects.toMatchObject({
      tiktok: { errorCode: 'upload_rejected', httpStatus: 403 },
    })
    expect(http.put).toHaveBeenCalledTimes(1)
  })

  it('réessaie un incident transitoire puis aboutit', async () => {
    const { uploader, http, options } = makeUploader(2 * MB)
    http.put
      .mockReturnValueOnce(of({ status: 503, data: '' }))
      .mockReturnValueOnce(of({ status: 201, data: '' }))

    await expect(uploader.upload(options)).resolves.toBeUndefined()
    expect(http.put).toHaveBeenCalledTimes(2)
  })

  it('abandonne une coupure réseau sans jamais exposer le corps de la réponse', async () => {
    const { uploader, http, options } = makeUploader(2 * MB)
    http.put.mockReturnValue(
      throwError(() => Object.assign(new Error('socket'), { code: 'ECONNRESET' })),
    )

    await expect(uploader.upload(options)).rejects.toMatchObject({
      tiktok: { errorCode: 'upload_interrupted' },
    })
    // 1 tentative initiale + MAX_RETRIES.
    expect(http.put).toHaveBeenCalledTimes(3)
  })
})
