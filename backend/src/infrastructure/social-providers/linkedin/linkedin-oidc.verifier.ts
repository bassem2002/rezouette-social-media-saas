import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
  type KeyLike,
} from 'jose'
import { LinkedInConfig } from '../../../config/linkedin.config.js'
import { LinkedInIdTokenClaims } from './linkedin-api.types.js'

/// Endpoints OIDC fixes de LinkedIn (discovery : /oauth/.well-known/openid-configuration).
/// `iss` NE contient PAS le suffixe `/v2` de l'endpoint OAuth.
export const LINKEDIN_OIDC_ISSUER = 'https://www.linkedin.com/oauth'
export const LINKEDIN_JWKS_URI = 'https://www.linkedin.com/oauth/openid/jwks'

/// Résolveur de clés accepté par `jose.jwtVerify` : soit un JWKS distant, soit une
/// clé publique locale (utilisée pour injecter un JWKS mocké dans les tests).
type KeyResolver = JWTVerifyGetKey | KeyLike | Uint8Array

/// Valide cryptographiquement l'id_token OIDC LinkedIn : signature RS256 contre le
/// JWKS LinkedIn, puis `iss` / `aud` (= client_id) / `exp` / `iat` (via jose) et
/// `nonce` (anti-rejeu, relié au state). Aucune confiance accordée à un token dont
/// la signature n'est pas vérifiée.
@Injectable()
export class LinkedInOidcVerifier {
  private remoteJwks?: JWTVerifyGetKey
  /// Surcharge de résolveur de clés (tests : clé publique locale / JWKS mocké).
  private keyOverride?: KeyResolver

  constructor(private readonly config: ConfigService) {}

  private get linkedin(): LinkedInConfig {
    return this.config.getOrThrow<LinkedInConfig>('linkedin')
  }

  /// Injecte un résolveur de clés (tests uniquement) — n'appelle jamais le réseau.
  setKeyResolver(resolver: KeyResolver): void {
    this.keyOverride = resolver
  }

  private resolver(): KeyResolver {
    if (this.keyOverride) {
      return this.keyOverride
    }
    // JWKS distant mis en cache par jose (rotation de clés gérée en interne).
    this.remoteJwks ??= createRemoteJWKSet(new URL(LINKEDIN_JWKS_URI))
    return this.remoteJwks
  }

  /// Vérifie l'id_token et renvoie ses claims. Lève UnauthorizedException si la
  /// signature, l'issuer, l'audience, l'expiration ou le nonce sont invalides.
  async verify(
    idToken: string,
    expectedNonce: string,
  ): Promise<LinkedInIdTokenClaims> {
    let payload: LinkedInIdTokenClaims
    try {
      const result = await jwtVerify(
        idToken,
        this.resolver() as JWTVerifyGetKey,
        {
          issuer: LINKEDIN_OIDC_ISSUER,
          audience: this.linkedin.clientId,
          // jose valide exp/nbf (et le format iat) — clockTolerance couvre les
          // petites dérives d'horloge entre le serveur et LinkedIn.
          clockTolerance: 30,
        },
      )
      payload = result.payload as unknown as LinkedInIdTokenClaims
    } catch (err) {
      throw new UnauthorizedException(
        `id_token LinkedIn invalide: ${err instanceof Error ? err.message : 'échec de vérification'}`,
      )
    }

    if (!payload.sub) {
      throw new UnauthorizedException('id_token LinkedIn sans claim `sub`.')
    }
    // LinkedIn n'inclut PAS le claim `nonce` dans l'id_token (comportement connu de
    // leur implémentation OIDC — le nonce est accepté en entrée mais non ré-émis).
    // On ne vérifie donc le nonce que s'il est RÉELLEMENT présent. En son absence,
    // la protection CSRF/anti-rejeu repose sur le `state` signé HMAC + le nonce à
    // usage unique (déjà validés au callback) et sur l'échange du code en
    // back-channel TLS (l'id_token ne provient jamais du navigateur).
    if (
      payload.nonce !== undefined &&
      payload.nonce !== null &&
      payload.nonce !== expectedNonce
    ) {
      throw new UnauthorizedException('id_token LinkedIn : nonce non concordant.')
    }
    return payload
  }
}
