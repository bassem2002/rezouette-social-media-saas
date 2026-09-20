import { MetaExceptionMapper, MetaErrorAction } from './meta-exception-mapper.js'
import { MetaGraphError } from '../errors/meta-graph.error.js'
import { MetaErrorReason } from '../../../domain/social/errors/meta-error-reason.enum.js'

const mapper = new MetaExceptionMapper()

/// Erreur axios telle que la renvoie réellement la Graph API.
function graphError(code: number, message = 'peu importe', subcode?: number) {
  return {
    response: {
      data: {
        error: { code, message, ...(subcode ? { error_subcode: subcode } : {}) },
      },
    },
  }
}

describe('MetaExceptionMapper — média injoignable', () => {
  it("classe le 9004 Instagram comme un problème d'URL, pas un incident Meta", () => {
    const mapped = mapper.map(
      graphError(
        9004,
        'Impossible de récupérer le contenu multimédia à partir de cette URI',
      ),
    )

    expect(mapped.reason).toBe(MetaErrorReason.MEDIA_UNREACHABLE)
    expect(mapped.action).toBe(MetaErrorAction.FIX_MEDIA_URL)
    // Rejouer à l'identique échouera tant que l'URL n'a pas changé.
    expect(mapped.retryable).toBe(false)
  })

  it('classe le 324 Facebook de la même façon, malgré son message trompeur', () => {
    // Meta parle d'une image « utilisable dans une publicité » : rien à voir
    // avec la cause réelle, l'échec de téléchargement.
    const mapped = mapper.map(
      graphError(324, 'Assurez-vous que votre publication comporte une image'),
    )

    expect(mapped.reason).toBe(MetaErrorReason.MEDIA_UNREACHABLE)
    expect(mapped.action).toBe(MetaErrorAction.FIX_MEDIA_URL)
  })

  it('ne conseille plus JAMAIS de contacter le support sur ces deux codes', () => {
    for (const code of [9004, 324]) {
      expect(mapper.map(graphError(code)).action).not.toBe(
        MetaErrorAction.CONTACT_SUPPORT,
      )
    }
  })

  it('accepte aussi une MetaGraphError déjà normalisée', () => {
    const mapped = mapper.map(
      new MetaGraphError({ code: 9004, message: 'média injoignable' }),
    )
    expect(mapped.reason).toBe(MetaErrorReason.MEDIA_UNREACHABLE)
  })
})

describe('MetaExceptionMapper — classifications préexistantes', () => {
  it('190 + subcode 460 → reconnexion (cas le plus spécifique en premier)', () => {
    const mapped = mapper.map(graphError(190, 'session expirée', 460))
    expect(mapped.reason).toBe(MetaErrorReason.RECONNECT_REQUIRED)
    expect(mapped.action).toBe(MetaErrorAction.RECONNECT_ACCOUNT)
  })

  it('190 seul → rafraîchissement du token', () => {
    expect(mapper.map(graphError(190)).reason).toBe(MetaErrorReason.TOKEN_EXPIRED)
  })

  it('un timeout réseau reste réessayable', () => {
    const mapped = mapper.map({ code: 'ECONNABORTED', message: 'timeout of 5000ms' })
    expect(mapped.reason).toBe(MetaErrorReason.TIMEOUT)
    expect(mapped.retryable).toBe(true)
  })

  it('9007 (conteneur en préparation) est réessayable, pas un cas support', () => {
    const mapped = mapper.map(
      graphError(9007, "Le contenu n'est pas prêt à être publié"),
    )
    expect(mapped.reason).toBe(MetaErrorReason.MEDIA_NOT_READY)
    expect(mapped.action).toBe(MetaErrorAction.RETRY_LATER)
    expect(mapped.retryable).toBe(true)
  })

  it('un code inconnu retombe sur le support, lui', () => {
    const mapped = mapper.map(graphError(99999))
    expect(mapped.reason).toBe(MetaErrorReason.UNKNOWN_META_ERROR)
    expect(mapped.action).toBe(MetaErrorAction.CONTACT_SUPPORT)
  })
})
