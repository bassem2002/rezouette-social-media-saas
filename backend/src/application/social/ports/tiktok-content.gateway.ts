/// Port (DIP) pour les appels TikTok Content Posting API "runtime" (publication),
/// distinct de la passerelle OAuth. Le use case dépend de cette abstraction,
/// jamais d'axios ni de l'API TikTok directement.

export interface TikTokDirectPostInput {
  accessToken: string
  /// URL Zernio de la vidéo à publier. Elle sert à RETROUVER le média dans le
  /// stockage local, pas à être communiquée à TikTok : les octets sont poussés
  /// par Zernio (FILE_UPLOAD). Elle n'a donc pas besoin d'être joignable depuis
  /// Internet, mais doit bien désigner un média hébergé par cette instance —
  /// une URL externe est refusée (protection SSRF du port de lecture).
  videoUrl: string
  /// Légende/titre de la publication.
  caption: string
  /// Niveau de confidentialité souhaité. Doit appartenir aux options autorisées
  /// renvoyées par `creator_info` (une app non auditée n'autorise que SELF_ONLY).
  privacyLevel?: string
}

/// Résultat d'une publication Direct Post. TikTok publie de façon asynchrone :
/// - `complete` : PUBLISH_COMPLETE atteint, `postId` renseigné si fourni ;
/// - `processing` : TikTok a accepté la tâche mais le traitement n'était pas
///  terminé dans la fenêtre de polling (livraison finale asynchrone).
export interface TikTokPublishResult {
  publishId: string
  postId: string | null
  status: 'complete' | 'processing'
}

export interface TikTokContentGateway {
  /// Publie une vidéo en Direct Post : résout le média local, interroge
  /// `creator_info`, initialise la publication (source FILE_UPLOAD), transfère
  /// les octets par morceaux, puis suit le statut jusqu'à un état terminal ou
  /// l'épuisement de la fenêtre de polling. Lève `TikTokContentError` en cas
  /// d'échec applicatif TikTok comme de média inexploitable.
  publishVideoDirect(input: TikTokDirectPostInput): Promise<TikTokPublishResult>
}

export const TIKTOK_CONTENT_GATEWAY = Symbol('TikTokContentGateway')
