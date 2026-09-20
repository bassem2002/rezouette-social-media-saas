/// Port (DIP) pour la publication de contenu LinkedIn (profil membre au MVP),
/// distinct de la passerelle OAuth. Le use case dépend de cette abstraction et
/// NE connaît jamais l'endpoint réellement utilisé (`/rest/posts` vs `/v2/ugcPosts`) :
/// la sélection est faite par la factory d'infrastructure selon LINKEDIN_PUBLISH_API.

/// Auteur d'une publication. MVP = membre uniquement (organisation reportée).
export interface LinkedInAuthor {
  type: 'MEMBER'
  /// `urn:li:person:{id}`.
  urn: string
}

/// Visibilité d'un post LinkedIn (MVP : PUBLIC ou réservé aux connexions).
export type LinkedInVisibility = 'PUBLIC' | 'CONNECTIONS'

interface BaseInput {
  author: LinkedInAuthor
  /// Access token du membre (jamais logué).
  accessToken: string
  visibility: LinkedInVisibility
}

export interface LinkedInPublishTextInput extends BaseInput {
  text: string
}

export interface LinkedInPublishArticleInput extends BaseInput {
  /// Commentaire au-dessus de l'aperçu du lien.
  text: string
  /// URL de l'article/lien partagé (LinkedIn ne scrape pas : titre/desc fournis).
  url: string
  title?: string
  description?: string
}

export interface LinkedInPublishImageInput extends BaseInput {
  text: string
  /// URL publique de l'image à téléverser vers LinkedIn (une seule au MVP).
  imageUrl: string
  altText?: string
}

/// Résultat d'une publication : URN du post créé (`urn:li:share:...` ou
/// `urn:li:ugcPost:...`), extrait de l'en-tête `x-restli-id`.
export interface LinkedInPublishResult {
  postUrn: string
}

export interface LinkedInContentGateway {
  publishText(input: LinkedInPublishTextInput): Promise<LinkedInPublishResult>
  publishArticle(
    input: LinkedInPublishArticleInput,
  ): Promise<LinkedInPublishResult>
  publishImage(input: LinkedInPublishImageInput): Promise<LinkedInPublishResult>
}

export const LINKEDIN_CONTENT_GATEWAY = Symbol('LinkedInContentGateway')
