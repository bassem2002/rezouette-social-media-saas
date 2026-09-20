import { SocialPost } from '../entities/social-post.entity.js'
import type { SocialPostPlatform } from '../entities/social-post.entity.js'

/// Contrat de persistance de l'historique des publications. `save` fait office
/// d'upsert (création PENDING puis transition PUBLISHED/FAILED sur le même id).
export interface SocialPostRepository {
  save(post: SocialPost): Promise<void>
  findAll(): Promise<SocialPost[]>
  findById(id: string): Promise<SocialPost | null>
  findByUserId(userId: string): Promise<SocialPost[]>

  /// Publications encore en attente sur une plateforme, de la plus ancienne à la
  /// plus récente. Alimente la réconciliation du traitement asynchrone.
  ///
  /// Aucun filtre sur `publishId` : une ligne PENDING sans identifiant doit être
  /// détectée elle aussi, pour être abandonnée une fois trop ancienne.
  findPendingByPlatform(
    platform: SocialPostPlatform,
    limit: number,
  ): Promise<SocialPost[]>
}

export const SOCIAL_POST_REPOSITORY = Symbol('SocialPostRepository')
