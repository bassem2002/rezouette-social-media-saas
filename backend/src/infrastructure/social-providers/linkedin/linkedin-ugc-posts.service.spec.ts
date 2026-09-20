import { of } from 'rxjs'
import { LinkedInUgcPostsService } from './linkedin-ugc-posts.service.js'
import { LinkedInContentError } from '../../../application/social/errors/linkedin-content.error.js'

const AUTHOR = { type: 'MEMBER' as const, urn: 'urn:li:person:abc' }
const BASE = { accessToken: 'AT', author: AUTHOR, visibility: 'PUBLIC' as const }

function makeService(post: jest.Mock, uploader?: Partial<{ uploadForUgc: jest.Mock }>) {
  const http = { post, get: jest.fn(), put: jest.fn() } as never
  const config = {
    getOrThrow: () => ({ apiBaseUrl: 'https://api.linkedin.com', apiVersion: '202607' }),
  } as never
  const up = { uploadForRest: jest.fn(), uploadForUgc: jest.fn(), ...uploader } as never
  return new LinkedInUgcPostsService(http, config, up)
}

describe('LinkedInUgcPostsService (/v2/ugcPosts)', () => {
  it('publie un texte (ShareContent NONE) et renvoie l’URN', async () => {
    const post = jest.fn().mockReturnValue(
      of({ status: 201, headers: { 'x-restli-id': 'urn:li:ugcPost:5' }, data: {} }),
    )
    const service = makeService(post)
    const result = await service.publishText({ ...BASE, text: 'Bonjour' })

    expect(result).toEqual({ postUrn: 'urn:li:ugcPost:5' })
    const [url, body] = post.mock.calls[0]
    expect(url).toBe('https://api.linkedin.com/v2/ugcPosts')
    expect(body.author).toBe('urn:li:person:abc')
    expect(
      body.specificContent['com.linkedin.ugc.ShareContent'].shareMediaCategory,
    ).toBe('NONE')
  })

  it('publie une image (asset uploadé) en shareMediaCategory IMAGE', async () => {
    const post = jest.fn().mockReturnValue(
      of({ status: 201, headers: { 'x-restli-id': 'urn:li:ugcPost:6' }, data: {} }),
    )
    const uploadForUgc = jest.fn().mockResolvedValue('urn:li:digitalmediaAsset:1')
    const service = makeService(post, { uploadForUgc })
    await service.publishImage({ ...BASE, text: 'photo', imageUrl: 'https://img/x.jpg' })

    expect(uploadForUgc).toHaveBeenCalledTimes(1)
    const share = post.mock.calls[0][1].specificContent['com.linkedin.ugc.ShareContent']
    expect(share.shareMediaCategory).toBe('IMAGE')
    expect(share.media[0].media).toBe('urn:li:digitalmediaAsset:1')
  })

  it('lève LinkedInContentError si x-restli-id absent', async () => {
    const post = jest.fn().mockReturnValue(of({ status: 201, headers: {}, data: {} }))
    const service = makeService(post)
    await expect(service.publishText({ ...BASE, text: 'x' })).rejects.toBeInstanceOf(
      LinkedInContentError,
    )
  })
})
