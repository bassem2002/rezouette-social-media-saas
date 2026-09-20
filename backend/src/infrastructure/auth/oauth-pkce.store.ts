import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { OAuthSecurityConfig } from '../../config/oauth-security.config.js'
import { OAuthErrorCode, oauthBadRequest } from './oauth-error.js'

interface PkceEntry {
  codeVerifier: string
  expiresAt: number
}

/// Stockage serveur des `code_verifier` PKCE, indexés par le `nonce` OAuth
/// (lui-même transporté dans le `state` signé). Le verifier ne quitte donc
/// jamais le backend : le navigateur ne voit que le `code_challenge`.
///
/// Durée de vie alignée sur celle du `state` (OAUTH_STATE_TTL_SECONDS) : une
/// entrée PKCE ne survit jamais au state qui l'accompagne.
///
/// ⚠️ Développement mono-instance uniquement : une Map en mémoire n'est PAS
/// partagée entre processus. En production multi-instance, un callback traité
/// par une autre instance échouerait en PKCE_VERIFIER_NOT_FOUND — remplacer par
/// un store partagé (Redis ou table Prisma) avant tout déploiement scale-out.
/// Même dette que l'OAuthNonceStore, avec lequel ce store se compose.
@Injectable()
export class OAuthPkceStore {
  private readonly entries = new Map<string, PkceEntry>()

  constructor(private readonly config: ConfigService) {}

  private get ttlMs(): number {
    return (
      this.config.getOrThrow<OAuthSecurityConfig>('oauthSecurity')
        .stateTtlSeconds * 1000
    )
  }

  /// Mémorise le `codeVerifier` associé à un `nonce` fraîchement émis.
  issue(nonce: string, codeVerifier: string, now: number = Date.now()): void {
    this.sweep(now)
    this.entries.set(nonce, { codeVerifier, expiresAt: now + this.ttlMs })
  }

  /// Lecture DESTRUCTIVE : renvoie le verifier et supprime l'entrée (usage
  /// unique). Lève une 400 normalisée si l'entrée est inconnue, déjà consommée
  /// ou expirée. Le message ne contient jamais le nonce ni le verifier.
  consume(nonce: string, now: number = Date.now()): string {
    const entry = this.entries.get(nonce)
    if (entry === undefined) {
      throw oauthBadRequest(
        OAuthErrorCode.PKCE_VERIFIER_NOT_FOUND,
        'Vérificateur PKCE introuvable ou déjà utilisé.',
      )
    }
    // Suppression AVANT tout contrôle : une entrée présentée deux fois est
    // consommée de toute façon (pas de fenêtre de rejeu sur une entrée expirée).
    this.entries.delete(nonce)
    if (entry.expiresAt <= now) {
      throw oauthBadRequest(
        OAuthErrorCode.PKCE_VERIFIER_EXPIRED,
        'Vérificateur PKCE expiré : relancez la connexion.',
      )
    }
    return entry.codeVerifier
  }

  /// Abandon silencieux d'une entrée (nettoyage quand le démarrage du flux
  /// échoue après l'émission). Ne lève jamais.
  discard(nonce: string): void {
    this.entries.delete(nonce)
  }

  /// Purge paresseuse des entrées expirées (évite la croissance non bornée).
  private sweep(now: number): void {
    for (const [nonce, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(nonce)
      }
    }
  }
}
