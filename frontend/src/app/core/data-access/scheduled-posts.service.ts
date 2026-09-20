import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import type {
  CreateScheduledPostRequest,
  ScheduledPost,
} from '@core/models';

/// Accès aux publications programmées (CRUD planification).
@Injectable({ providedIn: 'root' })
export class ScheduledPostsService {
  private readonly http = inject(HttpClient);

  /// POST /social/scheduled-posts — programme une publication différée.
  create(payload: CreateScheduledPostRequest): Observable<ScheduledPost> {
    return this.http.post<ScheduledPost>('/social/scheduled-posts', payload);
  }

  /// GET /social/scheduled-posts?userId= — liste des planifications du user.
  listByUser(userId: string): Observable<ScheduledPost[]> {
    return this.http.get<ScheduledPost[]>('/social/scheduled-posts', {
      params: { userId },
    });
  }

  /// GET /social/scheduled-posts/:id — une planification par id.
  getById(id: string): Observable<ScheduledPost> {
    return this.http.get<ScheduledPost>(`/social/scheduled-posts/${id}`);
  }

  /// DELETE /social/scheduled-posts/:id — annule (passage CANCELLED).
  cancel(id: string): Observable<ScheduledPost> {
    return this.http.delete<ScheduledPost>(`/social/scheduled-posts/${id}`);
  }
}
