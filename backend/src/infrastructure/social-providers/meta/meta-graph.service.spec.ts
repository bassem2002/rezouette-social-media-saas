import { of, throwError } from 'rxjs'
import { MetaGraphService } from './meta-graph.service.js'
import { MetaGraphError } from '../../../application/social/errors/meta-graph.error.js'

/// Erreur réseau "avant réponse" (pas de `response`) — cas de l'ETIMEDOUT de
/// connexion observé quand le scheduler se déclenche après une coupure réseau.
function networkError(code: string): Error {
  return Object.assign(new Error(`connect ${code} 1.2.3.4:443`), { code })
}

/// Erreur applicative Meta (avec `response`) — ne doit JAMAIS être réessayée.
function metaApiError() {
  return {
    response: {
      data: { error: { message: 'Invalid token', code: 190 } },
    },
  }
}

function makeService(post: jest.Mock) {
  const http = { post, get: jest.fn() } as never
  const config = {
    getOrThrow: () => ({ graphVersion: 'v21.0' }),
  } as never
  return new MetaGraphService(http, config)
}

describe('MetaGraphService — robustesse réseau (retry)', () => {
  it('réessaie un ETIMEDOUT de connexion transitoire puis réussit', async () => {
    const post = jest
      .fn()
      .mockReturnValueOnce(throwError(() => networkError('ETIMEDOUT')))
      .mockReturnValueOnce(throwError(() => networkError('ETIMEDOUT')))
      .mockReturnValueOnce(of({ data: { id: '123_456' } }))

    const service = makeService(post)
    const result = await service.publishPagePost('PAGE', 'TOKEN', 'Bonjour')

    expect(result).toEqual({ id: '123_456' })
    expect(post).toHaveBeenCalledTimes(3) // 1 essai + 2 retries
  })

  it('abandonne après le nombre maximal de tentatives', async () => {
    const post = jest
      .fn()
      .mockReturnValue(throwError(() => networkError('ETIMEDOUT')))

    const service = makeService(post)
    await expect(
      service.publishPagePost('PAGE', 'TOKEN', 'Bonjour'),
    ).rejects.toBeInstanceOf(MetaGraphError)
    expect(post).toHaveBeenCalledTimes(3) // 1 + 2 retries, puis échec
  })

  it('ne réessaie PAS une erreur applicative Meta (réponse HTTP présente)', async () => {
    const post = jest.fn().mockReturnValue(throwError(() => metaApiError()))

    const service = makeService(post)
    await expect(
      service.publishPagePost('PAGE', 'TOKEN', 'Bonjour'),
    ).rejects.toBeInstanceOf(MetaGraphError)
    expect(post).toHaveBeenCalledTimes(1) // aucun retry sur erreur applicative
  })
})

/// Service exposant aussi son mock `get` : la préparation du conteneur
/// Instagram se lit par GET, entre les deux POST.
function makeInstagramService(post: jest.Mock, get: jest.Mock) {
  const http = { post, get } as never
  const config = { getOrThrow: () => ({ graphVersion: 'v21.0' }) } as never
  return { service: new MetaGraphService(http, config), post, get }
}

function status(statusCode: string, statusText?: string) {
  return of({ data: { status_code: statusCode, ...(statusText ? { status: statusText } : {}) } })
}

/// Les deux POST du flux Instagram : création du conteneur, puis publication.
function instagramPosts() {
  return jest
    .fn()
    .mockReturnValueOnce(of({ data: { id: 'CONTAINER_1' } }))
    .mockReturnValueOnce(of({ data: { id: 'IG_POST_1' } }))
}

describe('MetaGraphService — conteneur Instagram', () => {
  it("attend la fin du traitement avant de publier", async () => {
    // Meta transcode encore aux deux premières lectures : publier tout de suite
    // renverrait 9007.
    const get = jest
      .fn()
      .mockReturnValueOnce(status('IN_PROGRESS'))
      .mockReturnValueOnce(status('IN_PROGRESS'))
      .mockReturnValueOnce(status('FINISHED'))
    const { service, post } = makeInstagramService(instagramPosts(), get)

    const result = await service.publishInstagramImage(
      'IG_USER',
      'TOKEN',
      'https://exemple.test/x.png',
      'légende',
    )

    expect(result).toEqual({ id: 'IG_POST_1' })
    expect(get).toHaveBeenCalledTimes(3)
    // La publication n'est tentée qu'APRÈS le passage à FINISHED.
    expect(post).toHaveBeenCalledTimes(2)
    expect(post.mock.calls[1][0]).toContain('/media_publish')
  })

  it('publie sans attendre quand le conteneur est prêt du premier coup', async () => {
    const get = jest.fn().mockReturnValue(status('FINISHED'))
    const { service, post } = makeInstagramService(instagramPosts(), get)

    await service.publishInstagramImage('IG_USER', 'TOKEN', 'https://x.test/a.png', '')

    expect(get).toHaveBeenCalledTimes(1)
    expect(post).toHaveBeenCalledTimes(2)
  })

  it('renonce si Meta rejette le média, sans tenter la publication', async () => {
    const get = jest
      .fn()
      .mockReturnValue(status('ERROR', 'Format non pris en charge'))
    const { service, post } = makeInstagramService(instagramPosts(), get)

    await expect(
      service.publishInstagramImage('IG_USER', 'TOKEN', 'https://x.test/a.png', ''),
    ).rejects.toMatchObject({ meta: { code: 9004, message: 'Format non pris en charge' } })

    // Seule la création a eu lieu : on ne publie pas un conteneur en échec.
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('abandonne en 9007 réessayable si la fenêtre d’attente est épuisée', async () => {
    const get = jest.fn().mockReturnValue(status('IN_PROGRESS'))
    const { service, post } = makeInstagramService(instagramPosts(), get)

    await expect(
      service.publishInstagramImage('IG_USER', 'TOKEN', 'https://x.test/a.png', ''),
    ).rejects.toMatchObject({ meta: { code: 9007 } })

    expect(post).toHaveBeenCalledTimes(1)
  }, 30_000)
})
