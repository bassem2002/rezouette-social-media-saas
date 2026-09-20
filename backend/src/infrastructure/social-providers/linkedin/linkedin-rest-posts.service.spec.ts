import { of, throwError } from 'rxjs'
import { LinkedInRestPostsService } from './linkedin-rest-posts.service.js'
import { LinkedInContentError } from '../../../application/social/errors/linkedin-content.error.js'

const AUTHOR = { type: 'MEMBER' as const, urn: 'urn:li:person:abc' }
const BASE = { accessToken: 'AT', author: AUTHOR, visibility: 'PUBLIC' as const }

function makeService(post: jest.Mock, uploader?: Partial<{ uploadForRest: jest.Mock }>) {
  const http = { post, get: jest.fn(), put: jest.fn() } as never
  const config = {
    getOrThrow: () => ({ apiBaseUrl: 'https://api.linkedin.com', apiVersion: '202607' }),
  } as never
  const up = { uploadForRest: jest.fn(), uploadForUgc: jest.fn(), ...uploader } as never
  return new LinkedInRestPostsService(http, config, up)
}

describe('LinkedInRestPostsService (/rest/posts)', () => {
  it('publie un texte et renvoie l’URN depuis x-restli-id', async () => {
    const post = jest.fn().mockReturnValue(
      of({ status: 201, headers: { 'x-restli-id': 'urn:li:share:9' }, data: {} }),
    )
    const service = makeService(post)
    const result = await service.publishText({ ...BASE, text: 'Bonjour' })

    expect(result).toEqual({ postUrn: 'urn:li:share:9' })
    const [url, body, cfg] = post.mock.calls[0]
    expect(url).toBe('https://api.linkedin.com/rest/posts')
    expect(body.author).toBe('urn:li:person:abc')
    expect(body.commentary).toBe('Bonjour')
    expect(cfg.headers['LinkedIn-Version']).toBe('202607')
    expect(cfg.headers['X-Restli-Protocol-Version']).toBe('2.0.0')
  })

  it('lève LinkedInContentError si x-restli-id est absent', async () => {
    const post = jest.fn().mockReturnValue(of({ status: 201, headers: {}, data: {} }))
    const service = makeService(post)
    await expect(service.publishText({ ...BASE, text: 'x' })).rejects.toBeInstanceOf(
      LinkedInContentError,
    )
  })

  it('propage une erreur HTTP LinkedIn (mappée en amont par le use case)', async () => {
    const post = jest
      .fn()
      .mockReturnValue(
        throwError(() => ({ response: { status: 401, data: { message: 'invalid token' } } })),
      )
    const service = makeService(post)
    await expect(service.publishText({ ...BASE, text: 'x' })).rejects.toMatchObject({
      response: { status: 401 },
    })
  })

  it('publie un article avec source/title/description', async () => {
    const post = jest.fn().mockReturnValue(
      of({ status: 201, headers: { 'x-restli-id': 'urn:li:share:10' }, data: {} }),
    )
    const service = makeService(post)
    await service.publishArticle({
      ...BASE, text: 'voir', url: 'https://z.com', title: 'T', description: 'D',
    })
    const body = post.mock.calls[0][1]
    expect(body.content.article).toEqual({
      source: 'https://z.com', title: 'T', description: 'D',
    })
  })

  it('publie une image après upload (uploader mocké)', async () => {
    const post = jest.fn().mockReturnValue(
      of({ status: 201, headers: { 'x-restli-id': 'urn:li:share:11' }, data: {} }),
    )
    const uploadForRest = jest.fn().mockResolvedValue('urn:li:image:42')
    const service = makeService(post, { uploadForRest })
    const result = await service.publishImage({
      ...BASE, text: 'photo', imageUrl: 'https://img/x.jpg', altText: 'alt',
    })
    expect(uploadForRest).toHaveBeenCalledTimes(1)
    expect(result.postUrn).toBe('urn:li:share:11')
    const body = post.mock.calls[0][1]
    expect(body.content.media).toEqual({ id: 'urn:li:image:42', altText: 'alt' })
  })
})
