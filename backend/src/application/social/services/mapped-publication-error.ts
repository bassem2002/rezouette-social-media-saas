/// Diagnostic d'échec de publication normalisé, indépendant du réseau social.
/// Contrat commun consommé par le PublicationOutcome, l'orchestrateur multi-réseaux
/// et la présentation. Meta (`MappedMetaError`) et TikTok en sont des spécialisations
/// structurellement compatibles (leur `reason` est une string enum).
export interface MappedPublicationError {
  /// Code d'erreur propre au réseau (Graph pour Meta, HTTP/logique pour TikTok).
  code: number
  /// Sous-code éventuel (Meta) — absent pour TikTok.
  subcode?: number
  /// Raison métier normalisée (valeur d'une énumération de raisons par réseau).
  reason: string
  /// Le réessai a-t-il une chance d'aboutir ?
  retryable: boolean
  /// Action recommandée au consommateur (reconnexion, correction, réessai…).
  action: string
}
