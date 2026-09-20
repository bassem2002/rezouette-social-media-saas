import { of, throwError } from 'rxjs'
import { LinkedInImageUploader } from './linkedin-image-uploader.js'
import { LinkedInContentError } from '../../../application/social/errors/linkedin-content.error.js'

function makeUploader(post: jest.Mock, get: jest.Mock, put: jest.Mock) {
  const http = { post, get, put } as never
  return new LinkedInImageUploader(http)
}

const REST_ARGS = {
  accessToken: 'AT',
  ownerUrn: 'urn:li:person:abc',
  imageUrl: 'https://img/x.jpg',
  apiBaseUrl: 'https://api.linkedin.com',
  apiVersion: '202607',
}

describe('LinkedInImageUploader', () => {
  it('uploadForRest : init → download → PUT → renvoie l’URN image', async () => {
    const post = jest.fn().mockReturnValue(
      of({ data: { value: { uploadUrl: 'https://up/1', image: 'urn:li:image:1' } } }),
    )
    const get = jest.fn().mockReturnValue(of({ data: new ArrayBuffer(8) }))
    const put = jest.fn().mockReturnValue(of({ status: 201 }))
    const uploader = makeUploader(post, get, put)

    const urn = await uploader.uploadForRest(REST_ARGS)

    expect(urn).toBe('urn:li:image:1')
    expect(post.mock.calls[0][0]).toBe(
      'https://api.linkedin.com/rest/images?action=initializeUpload',
    )
    expect(get).toHaveBeenCalledWith('https://img/x.jpg', { responseType: 'arraybuffer' })
    expect(Buffer.isBuffer(put.mock.calls[0][1])).toBe(true)
  })

  it('uploadForRest : réponse init incomplète → media_upload_failed', async () => {
    const post = jest.fn().mockReturnValue(of({ data: { value: {} } }))
    const uploader = makeUploader(post, jest.fn(), jest.fn())
    await expect(uploader.uploadForRest(REST_ARGS)).rejects.toMatchObject({
      linkedin: { serviceErrorCode: 'media_upload_failed' },
    })
  })

  it('uploadForRest : échec du PUT → LinkedInContentError media_upload_failed', async () => {
    const post = jest.fn().mockReturnValue(
      of({ data: { value: { uploadUrl: 'https://up/1', image: 'urn:li:image:1' } } }),
    )
    const get = jest.fn().mockReturnValue(of({ data: new ArrayBuffer(8) }))
    const put = jest.fn().mockReturnValue(throwError(() => new Error('network')))
    const uploader = makeUploader(post, get, put)

    await expect(uploader.uploadForRest(REST_ARGS)).rejects.toBeInstanceOf(
      LinkedInContentError,
    )
  })
})
