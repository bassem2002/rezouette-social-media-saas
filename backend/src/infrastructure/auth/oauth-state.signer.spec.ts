import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { OAuthStateSigner } from './oauth-state.signer.js'

const TTL_SECONDS = 600

/// ConfigService mocké : fournit la configuration OAuth PARTAGÉE (`oauthSecurity`),
/// et non plus la configuration LinkedIn — c'est tout l'objet de la généralisation.
function makeSigner(secret = 'test-state-secret', ttlSeconds = TTL_SECONDS) {
  const config = {
    getOrThrow: () => ({ stateSecret: secret, stateTtlSeconds: ttlSeconds }),
  } as never
  return new OAuthStateSigner(config)
}

describe('OAuthStateSigner', () => {
  describe('roundtrip par provider', () => {
    it('signe puis valide un state LinkedIn (comportement historique préservé)', () => {
      const signer = makeSigner()
      const state = signer.sign({
        userId: 'user-1',
        nonce: 'nonce-1',
        provider: 'linkedin',
      })

      const payload = signer.verify(state, 'linkedin')
      expect(payload.userId).toBe('user-1')
      expect(payload.nonce).toBe('nonce-1')
      expect(payload.provider).toBe('linkedin')
    })

    it('signe puis valide un state YouTube', () => {
      const signer = makeSigner()
      const state = signer.sign({
        userId: 'user-1',
        nonce: 'nonce-2',
        provider: 'youtube',
      })

      const payload = signer.verify(state, 'youtube')
      expect(payload.userId).toBe('user-1')
      expect(payload.nonce).toBe('nonce-2')
      expect(payload.provider).toBe('youtube')
    })

    it('ne transporte JAMAIS de secret dans le state (payload lisible)', () => {
      const signer = makeSigner('secret-tres-sensible')
      const state = signer.sign({
        userId: 'user-1',
        nonce: 'nonce-1',
        provider: 'youtube',
      })

      const decoded = Buffer.from(state.split('.')[0], 'base64url').toString('utf8')
      expect(decoded).not.toContain('secret-tres-sensible')
      expect(Object.keys(JSON.parse(decoded)).sort()).toEqual([
        'exp',
        'iat',
        'nonce',
        'provider',
        'userId',
      ])
    })
  })

  describe('cloisonnement des providers', () => {
    it('rejette un state LinkedIn présenté au callback YouTube', () => {
      const signer = makeSigner()
      const state = signer.sign({
        userId: 'user-1',
        nonce: 'nonce-1',
        provider: 'linkedin',
      })

      expect(() => signer.verify(state, 'youtube')).toThrow(BadRequestException)
      expect(() => signer.verify(state, 'youtube')).toThrow(/fournisseur/i)
    })

    it('rejette un state YouTube présenté au callback LinkedIn', () => {
      const signer = makeSigner()
      const state = signer.sign({
        userId: 'user-1',
        nonce: 'nonce-1',
        provider: 'youtube',
      })

      expect(() => signer.verify(state, 'linkedin')).toThrow(/fournisseur/i)
    })

    it('expose le code PROVIDER_MISMATCH', () => {
      const signer = makeSigner()
      const state = signer.sign({
        userId: 'user-1',
        nonce: 'nonce-1',
        provider: 'linkedin',
      })

      try {
        signer.verify(state, 'youtube')
        throw new Error('aurait dû lever')
      } catch (err) {
        const response = (err as BadRequestException).getResponse()
        expect(response).toMatchObject({ code: 'PROVIDER_MISMATCH' })
      }
    })
  })

  describe('contrôles de sécurité', () => {
    it('rejette un state expiré', () => {
      const signer = makeSigner()
      const past = Date.now() - 60 * 60 * 1000 // émis il y a 1 h (TTL 10 min)
      const state = signer.sign(
        { userId: 'user-1', nonce: 'nonce-1', provider: 'linkedin' },
        past,
      )

      expect(() => signer.verify(state, 'linkedin')).toThrow(BadRequestException)
      expect(() => signer.verify(state, 'linkedin')).toThrow(/expiré/i)
    })

    it('honore un TTL personnalisé issu de la config partagée', () => {
      const signer = makeSigner('secret', 60)
      const now = Date.now()
      const state = signer.sign(
        { userId: 'user-1', nonce: 'nonce-1', provider: 'youtube' },
        now,
      )

      expect(signer.verify(state, 'youtube', now + 59_000).userId).toBe('user-1')
      expect(() => signer.verify(state, 'youtube', now + 61_000)).toThrow(/expiré/i)
    })

    it('rejette un state émis dans le futur', () => {
      const signer = makeSigner()
      const future = Date.now() + 60 * 60 * 1000
      const state = signer.sign(
        { userId: 'user-1', nonce: 'nonce-1', provider: 'youtube' },
        future,
      )

      expect(() => signer.verify(state, 'youtube')).toThrow(/émission/i)
    })

    it('rejette un state falsifié (payload modifié → signature invalide)', () => {
      const signer = makeSigner()
      const state = signer.sign({
        userId: 'user-1',
        nonce: 'nonce-1',
        provider: 'linkedin',
      })

      const [encoded, sig] = state.split('.')
      const tampered = Buffer.from(
        JSON.stringify({
          userId: 'attacker',
          nonce: 'nonce-1',
          provider: 'linkedin',
          iat: Date.now(),
          exp: Date.now() + 600000,
        }),
        'utf8',
      ).toString('base64url')

      expect(() => signer.verify(`${tampered}.${sig}`, 'linkedin')).toThrow(
        BadRequestException,
      )
      // Le state d'origine reste valide (contrôle négatif).
      expect(signer.verify(`${encoded}.${sig}`, 'linkedin').userId).toBe('user-1')
    })

    it('rejette un state signé avec un autre secret', () => {
      const legit = makeSigner('secret-A')
      const state = legit.sign({
        userId: 'user-1',
        nonce: 'nonce-1',
        provider: 'linkedin',
      })

      const attacker = makeSigner('secret-B')
      expect(() => attacker.verify(state, 'linkedin')).toThrow(/signature/i)
    })

    it('rejette un state malformé', () => {
      const signer = makeSigner()
      expect(() => signer.verify('pas-un-state', 'linkedin')).toThrow(
        BadRequestException,
      )
    })

    it('rejette un state sans userId ni nonce', () => {
      const signer = makeSigner()
      const state = signer.sign({ userId: '', nonce: '', provider: 'youtube' })

      expect(() => signer.verify(state, 'youtube')).toThrow(/contenu/i)
    })
  })

  describe('secret absent', () => {
    it('assertConfigured() lève 503', () => {
      const signer = makeSigner('')
      expect(() => signer.assertConfigured()).toThrow(ServiceUnavailableException)
      expect(() => signer.assertConfigured()).toThrow(/OAUTH_STATE_SECRET/)
    })

    it('sign() lève 503 plutôt que de signer avec un secret vide', () => {
      const signer = makeSigner('')
      expect(() =>
        signer.sign({ userId: 'u', nonce: 'n', provider: 'youtube' }),
      ).toThrow(ServiceUnavailableException)
    })

    it('verify() lève 503', () => {
      const signer = makeSigner('')
      expect(() => signer.verify('a.b', 'youtube')).toThrow(
        ServiceUnavailableException,
      )
    })
  })
})
