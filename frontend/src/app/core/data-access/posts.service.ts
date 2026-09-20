import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import type { SocialPost } from '@core/models';

/// Accès à l'historique des publications (lecture seule côté API).
@Injectable({ providedIn: 'root' })
export class PostsService {
  private readonly http = inject(HttpClient);

  /// GET /social/posts/user/:userId — historique du user.
  listByUser(userId: string): Observable<SocialPost[]> {
    return this.http.get<SocialPost[]>(`/social/posts/user/${userId}`);
  }

  /// GET /social/posts/:id — une publication par id.
  getById(id: string): Observable<SocialPost> {
    return this.http.get<SocialPost>(`/social/posts/${id}`);
  }
}
