import { OAuthNonceStore } from './oauth-nonce.store.js'

describe('OAuthNonceStore', () => {
  it('consomme un nonce émis exactement une fois (usage unique)', () => {
    const store = new OAuthNonceStore()
    store.issue('nonce-1')

    expect(store.consume('nonce-1')).toBe(true)
    // Rejeu : le même nonce ne peut pas être consommé une seconde fois.
    expect(store.consume('nonce-1')).toBe(false)
  })

  it('refuse un nonce inconnu', () => {
    const store = new OAuthNonceStore()
    expect(store.consume('jamais-emis')).toBe(false)
  })

  it('refuse un nonce expiré', () => {
    const store = new OAuthNonceStore()
    const t0 = 1_000_000
    store.issue('nonce-1', t0)

    // 11 min plus tard (TTL 10 min) : expiré → refusé.
    const later = t0 + 11 * 60 * 1000
    expect(store.consume('nonce-1', later)).toBe(false)
  })
})
