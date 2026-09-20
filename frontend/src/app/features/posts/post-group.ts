import type { PostPlatform, PostStatus, SocialPost } from '@core/models';

/// Résultat d'une publication sur UNE plateforme — une ligne `SocialPost`.
export interface PostPlatformResultView {
  id: string;
  platform: PostPlatform;
  status: PostStatus;
  accountId: string | null;
  createdAt: string;
  publishedAt: string | null;
  errorMessage: string | null;
  metaReason: string | null;
}

/// Statut agrégé d'une publication multi-plateformes. `partial` existe parce
/// qu'une diffusion peut réussir sur un réseau et échouer sur un autre : la
/// réduire à « publiée » ou « échouée » masquerait la moitié de la vérité.
export type PostGroupStatus = 'published' | 'failed' | 'pending' | 'partial';

/// Une publication telle que l'utilisateur l'a conçue : un contenu, un média,
/// plusieurs plateformes.
export interface PostGroup {
  key: string;
  caption: string | null;
  mediaUrl: string | null;
  createdAt: string;
  /// Première publication effective du groupe, `null` si aucune n'a abouti.
  publishedAt: string | null;
  platforms: PostPlatform[];
  results: PostPlatformResultView[];
  status: PostGroupStatus;
  /// Identifiant abrégé affiché sur la carte (celui de la première ligne).
  displayId: string;
}

/// Clé de regroupement.
///
/// ⚠️ HEURISTIQUE ASSUMÉE : le backend enregistre une ligne `SocialPost` par
/// plateforme, SANS identifiant de publication commun. On regroupe donc sur le
/// contenu (légende + média) et la minute de création, car les lignes d'une même
/// diffusion sont écrites dans la même seconde par l'orchestrateur.
///
/// Conséquence acceptée : deux publications rigoureusement identiques envoyées
/// dans la même minute apparaîtraient comme une seule carte. Le compromis
/// inverse — une carte par plateforme — trahirait davantage l'intention de
/// l'utilisateur. Un `postId` partagé côté backend supprimerait l'ambiguïté
/// (voir les recommandations du rapport).
function groupKey(post: SocialPost): string {
  const minute = post.createdAt.slice(0, 16);
  return `${post.caption ?? ''}|${post.mediaUrl ?? ''}|${minute}`;
}

/// Ordre d'affichage des plateformes — stable d'une carte à l'autre.
const PLATFORM_ORDER: readonly PostPlatform[] = [
  'FACEBOOK',
  'INSTAGRAM',
  'TIKTOK',
  'LINKEDIN',
  'YOUTUBE',
];

function comparePlatforms(a: PostPlatform, b: PostPlatform): number {
  return PLATFORM_ORDER.indexOf(a) - PLATFORM_ORDER.indexOf(b);
}

/// Statut agrégé, dérivé des statuts réels — jamais supposé.
function aggregateStatus(results: PostPlatformResultView[]): PostGroupStatus {
  const published = results.filter((r) => r.status === 'PUBLISHED').length;
  const failed = results.filter((r) => r.status === 'FAILED').length;
  const pending = results.filter((r) => r.status === 'PENDING').length;

  if (published > 0 && failed > 0) return 'partial';
  if (failed > 0 && published === 0 && pending === 0) return 'failed';
  if (published > 0 && pending === 0) return 'published';
  if (pending > 0) return 'pending';
  return 'pending';
}

/// Regroupe l'historique brut en publications, les plus récentes d'abord.
export function groupSocialPosts(posts: readonly SocialPost[]): PostGroup[] {
  const groups = new Map<string, SocialPost[]>();
  for (const post of posts) {
    const key = groupKey(post);
    const bucket = groups.get(key);
    if (bucket) bucket.push(post);
    else groups.set(key, [post]);
  }

  const result: PostGroup[] = [];
  for (const [key, rows] of groups) {
    const results: PostPlatformResultView[] = rows
      .map((row) => ({
        id: row.id,
        platform: row.platform,
        status: row.status,
        accountId: row.accountId,
        createdAt: row.createdAt,
        publishedAt: row.publishedAt,
        errorMessage: row.errorMessage,
        metaReason: row.metaReason,
      }))
      .sort((a, b) => comparePlatforms(a.platform, b.platform));

    const publishedDates = results
      .map((r) => r.publishedAt)
      .filter((d): d is string => d !== null)
      .sort();

    const first = results[0];
    result.push({
      key,
      caption: rows[0].caption,
      mediaUrl: rows[0].mediaUrl,
      createdAt: rows.reduce(
        (earliest, row) => (row.createdAt < earliest ? row.createdAt : earliest),
        rows[0].createdAt,
      ),
      publishedAt: publishedDates[0] ?? null,
      platforms: results.map((r) => r.platform),
      results,
      status: aggregateStatus(results),
      displayId: first ? first.id : key,
    });
  }

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/// Libellé et tonalité du statut agrégé. Le libellé accompagne TOUJOURS la
/// couleur : un badge qui ne se distinguerait que par sa teinte serait
/// inutilisable pour une partie des utilisateurs.
export const POST_GROUP_STATUS_CONFIG: Record<
  PostGroupStatus,
  { label: string; tone: 'success' | 'error' | 'warning' | 'muted' }
> = {
  published: { label: 'published', tone: 'success' },
  failed: { label: 'failed', tone: 'error' },
  pending: { label: 'pending', tone: 'warning' },
  partial: { label: 'partially published', tone: 'warning' },
};

/// Début du contenu servant de titre à une carte. Sans légende, on l'annonce
/// plutôt que d'afficher une carte anonyme.
export function postTitle(group: PostGroup): string {
  const caption = group.caption?.trim();
  if (!caption) return 'Sans légende';
  const firstLine = caption.split('\n')[0].trim();
  return firstLine.length > 60 ? `${firstLine.slice(0, 59)}…` : firstLine;
}
