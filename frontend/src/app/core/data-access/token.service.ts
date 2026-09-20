import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import type {
  MetaTokenStatus,
  TikTokTokenStatus,
  LinkedInTokenStatus,
} from '@core/models';

/// Statut du cycle de vie des tokens sociaux (Meta + TikTok).
@Injectable({ providedIn: 'root' })
export class TokenService {
  private readonly http = inject(HttpClient);

  /// GET /social/meta/token-status?userId
  getStatus(userId: string): Observable<MetaTokenStatus> {
    return this.http.get<MetaTokenStatus>('/social/meta/token-status', {
      params: { userId },
    });
  }

  /// GET /social/tiktok/token-status?userId
  getTikTokStatus(userId: string): Observable<TikTokTokenStatus> {
    return this.http.get<TikTokTokenStatus>('/social/tiktok/token-status', {
      params: { userId },
    });
  }

  /// GET /social/linkedin/token-status?userId
  /// Renvoie 503 si LinkedIn n'est pas configuré côté backend, 404 si connecté
  /// mais aucun compte membre encore lié.
  getLinkedInStatus(userId: string): Observable<LinkedInTokenStatus> {
    return this.http.get<LinkedInTokenStatus>('/social/linkedin/token-status', {
      params: { userId },
    });
  }
}
