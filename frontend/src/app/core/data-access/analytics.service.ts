import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import type {
  AnalyticsDaily,
  AnalyticsErrors,
  AnalyticsOverview,
  AnalyticsPlatforms,
  AnalyticsScheduled,
} from '@core/models';

/// Accès aux statistiques agrégées (lecture seule). `userId` filtre par
/// utilisateur côté backend.
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly http = inject(HttpClient);

  overview(userId: string): Observable<AnalyticsOverview> {
    return this.http.get<AnalyticsOverview>('/analytics/overview', {
      params: { userId },
    });
  }
  platforms(userId: string): Observable<AnalyticsPlatforms> {
    return this.http.get<AnalyticsPlatforms>('/analytics/platforms', {
      params: { userId },
    });
  }
  errors(userId: string): Observable<AnalyticsErrors> {
    return this.http.get<AnalyticsErrors>('/analytics/errors', {
      params: { userId },
    });
  }
  daily(userId: string): Observable<AnalyticsDaily> {
    return this.http.get<AnalyticsDaily>('/analytics/daily', {
      params: { userId },
    });
  }
  scheduled(userId: string): Observable<AnalyticsScheduled> {
    return this.http.get<AnalyticsScheduled>('/analytics/scheduled', {
      params: { userId },
    });
  }
}
