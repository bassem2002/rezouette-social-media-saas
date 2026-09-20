import type { TokenStatus } from '@core/models';

/// Chaîne YouTube proposée dans le composer. Vue préparée par le composer à
/// partir des comptes et des statuts de tokens — le composant d'options reste
/// purement présentationnel.
export interface YouTubeChannelChoice {
  /// Id INTERNE du SocialAccount : c'est cette valeur qui part dans le payload,
  /// jamais le channelId, le nom ou un index de tableau.
  id: string;
  name: string;
  /// Ligne secondaire (abonnés, vidéos, @handle).
  subtitle: string;
  status: TokenStatus | null;
  /// Chaîne à reconnecter : proposée mais NON sélectionnable.
  disabled: boolean;
  /// Avertissement non bloquant (ex. absence d'autorisation durable). Une
  /// chaîne au token expiré n'est PAS bloquée : le backend le renouvellera.
  warning: string;
}
