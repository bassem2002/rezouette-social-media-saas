import { BadRequestException } from '@nestjs/common'
import { OAuthPkceStore } from './oauth-pkce.store.js'

const TTL_SECONDS = 600
const VERIFIER = 'fake-code-verifier-value'

function makeStore(ttlSeconds = TTL_SECONDS) {
  const config = {
    getOrThrow: () => ({ stateSecret: 'fake-secret', stateTtlSeconds: ttlSeconds }),
  } as never
  return new OAuthPkceStore(config)
}

/// Extrait le code normalisé du corps de l'exception.
function codeOf(err: unknown): string {
  const response = (err as BadRequestException).getResponse()
  return (response as { code: string }).code
}

describe('OAuthPkceStore', () => {
  it('restitue le code_verifier associé au nonce', () => {
    const store = makeStore()
    store.issue('nonce-1', VERIFIER)

    expect(store.consume('nonce-1')).toBe(VERIFIER)
  })

  it('est à usage unique : un second consume échoue', () => {
    const store = makeStore()
    store.issue('nonce-1', VERIFIER)
    store.consume('nonce-1')

    expect(() => store.consume('nonce-1')).toThrow(BadRequestException)
    try {
      store.consume('nonce-1')
    } catch (err) {
      expect(codeOf(err)).toBe('PKCE_VERIFIER_NOT_FOUND')
    }
  })

  it('refuse un nonce inconnu', () => {
    const store = makeStore()

    try {
      store.consume('jamais-emis')
      throw new Error('aurait dû lever')
    } catch (err) {
      expect(codeOf(err)).toBe('PKCE_VERIFIER_NOT_FOUND')
    }
  })

  it('refuse une entrée expirée (TTL aligné sur celui du state)', () => {
    const store = makeStore(600)
    const t0 = 1_000_000
    store.issue('nonce-1', VERIFIER, t0)

    try {
      store.consume('nonce-1', t0 + 601_000)
      throw new Error('aurait dû lever')
    } catch (err) {
      expect(codeOf(err)).toBe('PKCE_VERIFIER_EXPIRED')
    }
  })

  it('supprime une entrée expirée même si elle échoue (pas de rejeu)', () => {
    const store = makeStore(600)
    const t0 = 1_000_000
    store.issue('nonce-1', VERIFIER, t0)

    expect(() => store.consume('nonce-1', t0 + 601_000)).toThrow(/expiré/i)
    // Deuxième présentation : l'entrée n'existe plus du tout.
    try {
      store.consume('nonce-1', t0 + 1000)
      throw new Error('aurait dû lever')
    } catch (err) {
      expect(codeOf(err)).toBe('PKCE_VERIFIER_NOT_FOUND')
    }
  })

  it('honore un TTL personnalisé', () => {
    const store = makeStore(60)
    const t0 = 1_000_000
    store.issue('nonce-1', VERIFIER, t0)

    expect(store.consume('nonce-1', t0 + 59_000)).toBe(VERIFIER)
  })

  it('discard() abandonne une entrée sans lever', () => {
    const store = makeStore()
    store.issue('nonce-1', VERIFIER)

    expect(() => store.discard('nonce-1')).not.toThrow()
    expect(() => store.discard('inconnu')).not.toThrow()
    expect(() => store.consume('nonce-1')).toThrow(BadRequestException)
  })

  it('isole les nonces entre eux', () => {
    const store = makeStore()
    store.issue('nonce-1', 'verifier-1')
    store.issue('nonce-2', 'verifier-2')

    expect(store.consume('nonce-2')).toBe('verifier-2')
    expect(store.consume('nonce-1')).toBe('verifier-1')
  })

  it("n'expose jamais le verifier ni le nonce dans les messages d'erreur", () => {
    const store = makeStore()
    store.issue('nonce-secret', VERIFIER)
    store.consume('nonce-secret')

    try {
      store.consume('nonce-secret')
      throw new Error('aurait dû lever')
    } catch (err) {
      const message = (err as Error).message
      const response = JSON.stringify(
        (err as BadRequestException).getResponse(),
      )
      expect(message).not.toContain(VERIFIER)
      expect(message).not.toContain('nonce-secret')
      expect(response).not.toContain(VERIFIER)
      expect(response).not.toContain('nonce-secret')
    }
  })
})
