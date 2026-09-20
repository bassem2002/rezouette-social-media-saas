/// Historique des publications (GET /social/posts) — miroir de SocialPostResponseDto.
///
/// LINKEDIN et YOUTUBE font partie de l'enum backend : les omettre ici rendait
/// le type mensonger (dette corrigée avec l'intégration YouTube).
export type PostPlatform =
  | 'FACEBOOK'
  | 'INSTAGRAM'
  | 'TIKTOK'
  | 'LINKEDIN'
  | 'YOUTUBE';
export type PostStatus = 'PENDING' | 'PUBLISHED' | 'FAILED';

export interface SocialPost {
  id: string;
  userId: string;
  platform: PostPlatform;
  accountId: string | null;
  externalPostId: string | null;
  /// Identifiant de tâche asynchrone côté fournisseur (videoId YouTube,
  /// publish_id TikTok). Exposé par l'API depuis le CHECKPOINT 10.
  ///
  /// ⚠️ Ce n'est NI un identifiant de post public, NI une URL : il ne doit
  /// jamais être affiché tel quel, ni servir à construire un lien — la vidéo
  /// peut être encore invisible, ou finir en échec. Optionnel dans le type pour
  /// tolérer un backend antérieur qui ne le renvoyait pas.
  publishId?: string | null;
  caption: string | null;
  mediaUrl: string | null;
  status: PostStatus;
  errorMessage: string | null;
  metaCode: number | null;
  metaSubcode: number | null;
  metaReason: string | null;
  retryable: boolean | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const POST_STATUSES: readonly PostStatus[] = [
  'PUBLISHED',
  'FAILED',
  'PENDING',
];
