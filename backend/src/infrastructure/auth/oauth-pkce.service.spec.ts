import { createHash } from 'node:crypto'
import { OAuthPkceService } from './oauth-pkce.service.js'

/// Alphabet non réservé autorisé par la RFC 7636 pour le code_verifier.
const PKCE_ALPHABET = /^[A-Za-z0-9\-._~]+$/

describe('OAuthPkceService', () => {
  const service = new OAuthPkceService()

  it('génère un code_verifier de longueur conforme (43 à 128 caractères)', () => {
    const { codeVerifier } = service.generate()

    expect(codeVerifier.length).toBeGreaterThanOrEqual(43)
    expect(codeVerifier.length).toBeLessThanOrEqual(128)
  })

  it("n'utilise que des caractères autorisés par la RFC 7636", () => {
    for (let i = 0; i < 20; i += 1) {
      expect(service.generate().codeVerifier).toMatch(PKCE_ALPHABET)
    }
  })

  it('produit un challenge différent du verifier', () => {
    const { codeVerifier, codeChallenge } = service.generate()

    expect(codeChallenge).not.toBe(codeVerifier)
  })

  it('dérive le challenge en S256 : base64url(SHA-256(verifier))', () => {
    const { codeVerifier, codeChallenge } = service.generate()

    const expected = createHash('sha256').update(codeVerifier).digest('base64url')
    expect(codeChallenge).toBe(expected)
  })

  it('produit un challenge base64url sans padding', () => {
    const { codeChallenge } = service.generate()

    expect(codeChallenge).not.toContain('=')
    expect(codeChallenge).not.toContain('+')
    expect(codeChallenge).not.toContain('/')
    // SHA-256 (32 octets) → 43 caractères base64url sans padding.
    expect(codeChallenge).toHaveLength(43)
  })

  it('annonce la méthode S256 (jamais plain)', () => {
    expect(service.generate().codeChallengeMethod).toBe('S256')
  })

  it('génère un couple différent à chaque appel', () => {
    const first = service.generate()
    const second = service.generate()

    expect(first.codeVerifier).not.toBe(second.codeVerifier)
    expect(first.codeChallenge).not.toBe(second.codeChallenge)
  })
})
