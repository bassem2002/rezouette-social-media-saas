/// Port (DIP) pour les appels Graph API "runtime" (publication, vérification),
/// distinct de la passerelle OAuth. Le use case dépend de cette abstraction,
/// jamais d'axios ni de l'API Meta directement.

export interface MetaPublishResult {
  /// ID du post créé côté Facebook (format `{pageId}_{postId}`).
  id: string
}

export interface MetaPageProfile {
  pageId: string
  pageName: string
}

export interface MetaGraphGateway {
  /// Publie un message texte sur le fil d'une Page : POST /{pageId}/feed.
  publishPagePost(
    pageId: string,
    pageAccessToken: string,
    message: string,
  ): Promise<MetaPublishResult>

  /// Publie une photo (URL distante) sur une Page : POST /{pageId}/photos.
  /// `message` devient la légende de la photo. Renvoie le `post_id` du fil
  /// quand Meta le fournit (format `{pageId}_{postId}`), sinon l'id de la photo.
  publishPagePhoto(
    pageId: string,
    pageAccessToken: string,
    imageUrl: string,
    message: string,
  ): Promise<MetaPublishResult>

  /// Vérifie le token en lisant le profil de la Page : GET /{pageId}?fields=id,name.
  fetchPageProfile(
    pageId: string,
    pageAccessToken: string,
  ): Promise<MetaPageProfile>

  /// Publie une image sur un compte Instagram Business en 2 temps :
  /// POST /{igUserId}/media (conteneur) puis POST /{igUserId}/media_publish.
  publishInstagramImage(
    igUserId: string,
    pageAccessToken: string,
    imageUrl: string,
    caption: string,
  ): Promise<MetaPublishResult>
}

export const META_GRAPH_GATEWAY = Symbol('MetaGraphGateway')
