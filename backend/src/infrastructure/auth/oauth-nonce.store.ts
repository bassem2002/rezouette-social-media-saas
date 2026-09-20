import { Injectable } from '@nestjs/common'

/// TTL d'un nonce : aligné sur celui du `state` (10 min).
const NONCE_TTL_MS = 10 * 60 * 1000

/// Stockage mémoire des nonces OAuth à usage unique (protection anti-rejeu).
///
/// ⚠️ Développement uniquement : une Map en mémoire n'est PAS partagée entre
/// instances. En production multi-instance, remplacer par un store partagé
/// (Redis, ou une table Prisma) — migration additive, hors périmètre Phase 2.
@Injectable()
export class OAuthNonceStore {
  private readonly nonces = new Map<string, number>()

  /// Enregistre un nonce fraîchement émis (expire dans NONCE_TTL_MS).
  issue(nonce: string, now: number = Date.now()): void {
    this.sweep(now)
    this.nonces.set(nonce, now + NONCE_TTL_MS)
  }

  /// Consomme un nonce : renvoie `true` s'il était présent et non expiré (et le
  /// supprime → usage unique), `false` sinon (inconnu, déjà consommé ou expiré).
  consume(nonce: string, now: number = Date.now()): boolean {
    const expiresAt = this.nonces.get(nonce)
    if (expiresAt === undefined) {
      return false
    }
    this.nonces.delete(nonce)
    return expiresAt > now
  }

  /// Purge paresseuse des nonces expirés (évite la croissance non bornée de la Map).
  private sweep(now: number): void {
    for (const [nonce, expiresAt] of this.nonces) {
      if (expiresAt <= now) {
        this.nonces.delete(nonce)
      }
    }
  }
}
