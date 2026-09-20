import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createHmac, timingSafeEqual } from 'node:crypto'
import {
  isOAuthSecurityConfigured,
  type OAuthSecurityConfig,
} from '../../config/oauth-security.config.js'
import { OAuthErrorCode, oauthBadRequest, oauthUnavailable } from './oauth-error.js'

/// Fournisseurs OAuth dont le `state` est signé par ce service. Le provider fait
/// partie de la charge signée : un `state` émis pour un réseau ne peut pas être
/// rejoué sur le callback d'un autre.
export type OAuthStateProvider = 'linkedin' | 'youtube'

/// Charge utile signée transportée par le paramètre `state` OAuth. En l'absence
/// de session serveur (JWT non branché), on encode le `userId` et un `nonce` à
/// usage unique, protégés par une signature HMAC-SHA256 (intégrité + CSRF).
///
/// ⚠️ Le `state` ne transporte JAMAIS de secret : ni client_secret, ni
/// code_verifier PKCE (celui-ci reste côté serveur, voir OAuthPkceStore).
export interface OAuthStatePayload {
  userId: string
  /// Nonce à usage unique — clé de l'entrée anti-rejeu et de l'entrée PKCE.
  nonce: string
  /// Fournisseur ciblé — empêche la réutilisation d'un state d'un autre flux.
  provider: OAuthStateProvider
  /// Émis le (ms epoch).
  iat: number
  /// Expire le (ms epoch).
  exp: number
}

/// Signe/valide le `state` OAuth via HMAC-SHA256. Format :
/// `base64url(payload).base64url(signature)`. Le secret (OAUTH_STATE_SECRET) et
/// le TTL proviennent de la configuration OAuth PARTAGÉE (`oauthSecurity`) — et
/// non plus de la configuration LinkedIn, afin qu'un flux YouTube n'exige pas de
/// configurer LinkedIn.
@Injectable()
export class OAuthStateSigner {
  constructor(private readonly config: ConfigService) {}

  private get security(): OAuthSecurityConfig {
    return this.config.getOrThrow<OAuthSecurityConfig>('oauthSecurity')
  }

  /// Garde runtime : 503 explicite si le secret HMAC n'est pas provisionné.
  /// Jamais appelée au démarrage — uniquement à l'entrée d'un flux OAuth.
  assertConfigured(): void {
    if (!isOAuthSecurityConfigured(this.security)) {
      throw oauthUnavailable(
        OAuthErrorCode.OAUTH_STATE_NOT_CONFIGURED,
        'Sécurité OAuth non configurée : OAUTH_STATE_SECRET est requis.',
      )
    }
  }

  private get secret(): string {
    this.assertConfigured()
    return this.security.stateSecret
  }

  /// Signe un state pour `userId` + `nonce` + `provider`, valide le temps du TTL.
  sign(
    input: {
      userId: string
      nonce: string
      provider: OAuthStateProvider
    },
    now: number = Date.now(),
  ): string {
    const secret = this.secret
    const payload: OAuthStatePayload = {
      userId: input.userId,
      nonce: input.nonce,
      provider: input.provider,
      iat: now,
      exp: now + this.security.stateTtlSeconds * 1000,
    }
    const encoded = this.encode(payload)
    return `${encoded}.${this.hmac(encoded, secret)}`
  }

  /// Vérifie format, signature, contenu, fenêtre temporelle et provider attendu.
  /// Lève une 400 normalisée si l'un des contrôles échoue — sans jamais
  /// journaliser ni renvoyer le state.
  verify(
    state: string,
    expectedProvider: OAuthStateProvider,
    now: number = Date.now(),
  ): OAuthStatePayload {
    const secret = this.secret

    const parts = state.split('.')
    if (parts.length !== 2) {
      throw oauthBadRequest(OAuthErrorCode.INVALID_STATE, 'State OAuth invalide.')
    }
    const [encoded, signature] = parts

    if (!this.safeEqual(signature, this.hmac(encoded, secret))) {
      throw oauthBadRequest(
        OAuthErrorCode.INVALID_STATE,
        'State OAuth invalide (signature).',
      )
    }

    let payload: OAuthStatePayload
    try {
      payload = JSON.parse(
        Buffer.from(encoded, 'base64url').toString('utf8'),
      ) as OAuthStatePayload
    } catch {
      throw oauthBadRequest(
        OAuthErrorCode.INVALID_STATE,
        'State OAuth invalide (payload).',
      )
    }

    if (!payload.userId || !payload.nonce) {
      throw oauthBadRequest(
        OAuthErrorCode.INVALID_STATE,
        'State OAuth invalide (contenu).',
      )
    }
    // Un state LinkedIn présenté au callback YouTube (ou l'inverse) est refusé,
    // même si sa signature est authentique et sa fenêtre encore ouverte.
    if (payload.provider !== expectedProvider) {
      throw oauthBadRequest(
        OAuthErrorCode.PROVIDER_MISMATCH,
        'State OAuth invalide (fournisseur inattendu).',
      )
    }
    if (typeof payload.iat !== 'number' || payload.iat > now) {
      throw oauthBadRequest(
        OAuthErrorCode.INVALID_STATE,
        "State OAuth invalide (date d'émission).",
      )
    }
    if (typeof payload.exp !== 'number' || payload.exp <= now) {
      throw oauthBadRequest(OAuthErrorCode.STATE_EXPIRED, 'State OAuth expiré.')
    }
    return payload
  }

  private encode(payload: OAuthStatePayload): string {
    return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  }

  private hmac(encoded: string, secret: string): string {
    return createHmac('sha256', secret).update(encoded).digest('base64url')
  }

  /// Comparaison à temps constant (évite les timing attacks sur la signature).
  private safeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a)
    const bufB = Buffer.from(b)
    if (bufA.length !== bufB.length) {
      return false
    }
    return timingSafeEqual(bufA, bufB)
  }
}
