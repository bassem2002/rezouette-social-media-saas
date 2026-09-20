import { Post } from '../entities/post.entity.js'

export interface PostRepository {
  findById(id: string): Promise<Post | null>
  findByUserId(userId: string): Promise<Post[]>
  save(post: Post): Promise<void>
  delete(id: string): Promise<void>
}

export const POST_REPOSITORY = Symbol('PostRepository')
