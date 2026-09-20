import { ScheduledPost } from '../entities/scheduled-post.entity.js'

/// Contrat de persistance des publications programmées. `save` fait office
/// d'upsert (création SCHEDULED puis transitions sur le même id).
export interface ScheduledPostRepository {
  save(post: ScheduledPost): Promise<void>
  findById(id: string): Promise<ScheduledPost | null>
  findAll(): Promise<ScheduledPost[]>
  findByUserId(userId: string): Promise<ScheduledPost[]>
  /// Publications dues (status SCHEDULED et scheduledAt <= now), les plus
  /// anciennes d'abord. `limit` borne le lot traité par cycle du scheduler.
  findDue(now: Date, limit: number): Promise<ScheduledPost[]>
}

export const SCHEDULED_POST_REPOSITORY = Symbol('ScheduledPostRepository')
