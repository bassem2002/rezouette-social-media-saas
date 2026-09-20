import { Injectable } from '@nestjs/common'
import { createHash, randomBytes } from 'node:crypto'

/// Couple PKCE (RFC 7636). Le `codeVerifier` est un SECRET côté serveur : il ne
/// doit jamais partir vers le navigateur, ni transiter par le `state`, ni être
/// journalisé. Seul le `codeChallenge` circule dans l'URL d'autorisation.
export interface PkceChallenge {
  codeVerifier: string
  codeChallenge: string
  /// S256 uniquement — la méthode `plain` n'est volontairement pas supportée.
  codeChallengeMethod: 'S256'
}

/// 32 octets aléatoires → 43 caractères base64url, borne basse de la RFC 7636
/// (43 à 128 caractères, alphabet non réservé A-Z a-z 0-9 - . _ ~).
const VERIFIER_BYTES = 32

/// Génère les couples PKCE. Sans état : le stockage du `codeVerifier` relève de
/// l'OAuthPkceStore, sa consommation du controller.
@Injectable()
export class OAuthPkceService {
  /// Génère un `code_verifier` cryptographiquement aléatoire et son
  /// `code_challenge` = base64url(SHA-256(verifier)), sans padding.
  generate(): PkceChallenge {
    const codeVerifier = randomBytes(VERIFIER_BYTES).toString('base64url')
    return {
      codeVerifier,
      codeChallenge: this.deriveChallenge(codeVerifier),
      codeChallengeMethod: 'S256',
    }
  }

  /// base64url(SHA-256(verifier)). `base64url` de Node n'ajoute aucun padding.
  private deriveChallenge(codeVerifier: string): string {
    return createHash('sha256').update(codeVerifier).digest('base64url')
  }
}
