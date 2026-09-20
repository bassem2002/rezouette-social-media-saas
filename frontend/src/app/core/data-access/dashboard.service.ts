import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import type {
  DashboardAnalyticsResponse,
  DashboardRange,
} from '@core/models';

/// Accès aux statistiques du tableau de bord (lecture seule).
///
/// Responsabilité unique : transporter la requête HTTP. Aucun calcul de
/// présentation, aucun état global, aucun token — et aucun appel direct vers
/// Facebook, Instagram, TikTok, LinkedIn ou YouTube : le frontend ne parle
/// qu'au backend Rezouette.
@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly http = inject(HttpClient);

  /// GET /analytics/dashboard — vue d'ensemble sur la fenêtre demandée.
  getDashboardAnalytics(
    userId: string,
    range: DashboardRange,
  ): Observable<DashboardAnalyticsResponse> {
    return this.http.get<DashboardAnalyticsResponse>('/analytics/dashboard', {
      params: { userId, range },
    });
  }
}
