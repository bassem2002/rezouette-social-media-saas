import { UnauthorizedException } from '@nestjs/common'
import { generateKeyPair, SignJWT, exportJWK, type KeyLike } from 'jose'
import {
  LinkedInOidcVerifier,
  LINKEDIN_OIDC_ISSUER,
} from './linkedin-oidc.verifier.js'

const CLIENT_ID = 'client-123'

/// ConfigService mocké : ne fournit que le client_id (audience OIDC attendue).
function makeVerifier(publicKey: KeyLike): LinkedInOidcVerifier {
  const config = {
    getOrThrow: () => ({ clientId: CLIENT_ID }),
  } as never
  const verifier = new LinkedInOidcVerifier(config)
  // JWKS mocké : on injecte la clé publique locale (aucun appel réseau).
  verifier.setKeyResolver(publicKey)
  return verifier
}

async function signIdToken(
  privateKey: KeyLike,
  overrides: {
    issuer?: string
    audience?: string
    nonce?: string
    expInPast?: boolean
    sub?: string
    omitNonce?: boolean
  } = {},
): Promise<string> {
  // LinkedIn n'émet pas toujours le nonce → on doit pouvoir signer un token sans.
  const claims: Record<string, unknown> = {
    name: 'Jane Doe',
    picture: 'https://media.example/jane.jpg',
  }
  if (!overrides.omitNonce) {
    claims['nonce'] = overrides.nonce ?? 'nonce-1'
  }
  const jwt = new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(overrides.issuer ?? LINKEDIN_OIDC_ISSUER)
    .setAudience(overrides.audience ?? CLIENT_ID)
    .setSubject(overrides.sub ?? 'member-abc')
    .setIssuedAt()
  jwt.setExpirationTime(overrides.expInPast ? '-1h' : '1h')
  return jwt.sign(privateKey)
}

describe('LinkedInOidcVerifier', () => {
  let publicKey: KeyLike
  let privateKey: KeyLike

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256')
    publicKey = pair.publicKey
    privateKey = pair.privateKey
    // Sanity : la clé publique est exportable en JWK (forme d'un JWKS réel).
    expect((await exportJWK(publicKey)).kty).toBe('RSA')
  })

  it('valide un id_token correctement signé et renvoie les claims', async () => {
    const verifier = makeVerifier(publicKey)
    const token = await signIdToken(privateKey, { nonce: 'nonce-1' })

    const claims = await verifier.verify(token, 'nonce-1')
    expect(claims.sub).toBe('member-abc')
    expect(claims.name).toBe('Jane Doe')
  })

  it('rejette un mauvais issuer', async () => {
    const verifier = makeVerifier(publicKey)
    const token = await signIdToken(privateKey, {
      issuer: 'https://accounts.evil.example',
    })
    await expect(verifier.verify(token, 'nonce-1')).rejects.toBeInstanceOf(
      UnauthorizedException,
    )
  })

  it('rejette une mauvaise audience', async () => {
    const verifier = makeVerifier(publicKey)
    const token = await signIdToken(privateKey, { audience: 'autre-client' })
    await expect(verifier.verify(token, 'nonce-1')).rejects.toBeInstanceOf(
      UnauthorizedException,
    )
  })

  it('rejette un token expiré', async () => {
    const verifier = makeVerifier(publicKey)
    const token = await signIdToken(privateKey, { expInPast: true })
    await expect(verifier.verify(token, 'nonce-1')).rejects.toBeInstanceOf(
      UnauthorizedException,
    )
  })

  it('rejette un nonce présent mais non concordant', async () => {
    const verifier = makeVerifier(publicKey)
    const token = await signIdToken(privateKey, { nonce: 'nonce-1' })
    await expect(verifier.verify(token, 'nonce-attendu-different')).rejects.toThrow(
      /nonce/i,
    )
  })

  it('accepte un id_token SANS nonce (comportement LinkedIn) sans échouer', async () => {
    const verifier = makeVerifier(publicKey)
    const token = await signIdToken(privateKey, { omitNonce: true })
    // LinkedIn n'émet pas le nonce : la vérif ne doit pas rejeter pour autant.
    const claims = await verifier.verify(token, 'peu-importe')
    expect(claims.sub).toBe('member-abc')
    expect(claims.nonce).toBeUndefined()
  })

  it('rejette une signature invalide (clé publique différente)', async () => {
    const other = await generateKeyPair('RS256')
    const verifier = makeVerifier(other.publicKey) // mauvaise clé de vérification
    const token = await signIdToken(privateKey, { nonce: 'nonce-1' })
    await expect(verifier.verify(token, 'nonce-1')).rejects.toBeInstanceOf(
      UnauthorizedException,
    )
  })
})
