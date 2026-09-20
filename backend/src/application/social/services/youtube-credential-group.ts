import type { SocialAccount } from '../../../domain/social-account/entities/social-account.entity.js'

/// Un unique consentement Google peut retourner PLUSIEURS chaînes (compte de
/// marque). Ces chaînes deviennent autant de `SocialAccount`, mais partagent un
/// seul jeu de credentials : access token, refresh token, expiration et scopes.
/// Rafraîchir une seule ligne laisserait les autres avec un token périmé.
///
/// On marque donc les chaînes issues d'un même consentement avec un identifiant
/// de groupe, stocké dans `SocialAccount.metadata` — aucune migration requise,
/// conformément à la convention du projet pour les spécificités provider.
///
/// ⚠️ Cet identifiant est un UUID ALÉATOIRE, sans lien avec les credentials : il
/// n'est jamais dérivé du refresh token, ni un hash permettant de comparer ou
/// d'identifier un token. Il n'est jamais exposé par les endpoints publics.
export const YOUTUBE_CREDENTIAL_GROUP_KEY = 'youtubeCredentialGroupId'

/// Lit l'identifiant de groupe d'un compte, ou `null` s'il n'en a pas encore
/// (comptes connectés avant l'introduction du groupe — migration progressive).
export function readCredentialGroupId(account: SocialAccount): string | null {
  const raw = account.metadata?.[YOUTUBE_CREDENTIAL_GROUP_KEY]
  return typeof raw === 'string' && raw.trim() ? raw : null
}

/// Produit des metadata enrichies de l'identifiant de groupe, en PRÉSERVANT les
/// autres clés (thumbnailUrl, customUrl, uploadsPlaylistId, statistiques…).
///
/// Accepte aussi bien le `Record` du domaine que le type structuré renvoyé par
/// la passerelle (`YouTubeChannelMetadata`) : les deux sont de simples objets
/// JSON, d'où l'élargissement en `object` et l'unique cast de frontière.
export function withCredentialGroupId(
  metadata: object | null | undefined,
  groupId: string,
): Record<string, unknown> {
  return {
    ...((metadata ?? {}) as Record<string, unknown>),
    [YOUTUBE_CREDENTIAL_GROUP_KEY]: groupId,
  }
}

/// Retire l'identifiant de groupe avant toute exposition HTTP : détail interne
/// de synchronisation, sans valeur pour un client.
export function stripCredentialGroupId(
  metadata: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!metadata) return null
  const { [YOUTUBE_CREDENTIAL_GROUP_KEY]: _omitted, ...rest } = metadata
  return rest
}

/// Génère un identifiant de groupe neuf (UUID v4 aléatoire).
export function newCredentialGroupId(): string {
  return crypto.randomUUID()
}
