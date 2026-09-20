import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { youtubeConnectUrl } from '@/core/config/app-config';
import type {
  YouTubeAccount,
  YouTubeTokenStatusResponse,
} from '@core/models';

/// Accès aux données YouTube. Deux lectures STRICTEMENT PASSIVES et une URL de
/// connexion — rien d'autre.
///
/// Règles structurantes :
/// - aucun rafraîchissement de token n'est déclenché depuis Angular ; le backend
///   s'en charge au moment de publier ;
/// - aucun token n'est reçu, stocké ni manipulé ici (le backend ne les expose
///   pas, et rien ne doit finir en localStorage, sessionStorage ou signal) ;
/// - aucun appel direct à accounts.google.com ou youtube.googleapis.com : tout
///   passe par le backend Zernio.
@Injectable({ providedIn: 'root' })
export class YouTubeService {
  private readonly http = inject(HttpClient);

  /// GET /social/youtube/accounts?userId — chaînes connectées (0, 1 ou N).
  /// 503 si l'intégration n'est pas configurée côté serveur.
  getAccounts(userId: string): Observable<YouTubeAccount[]> {
    return this.http.get<YouTubeAccount[]>('/social/youtube/accounts', {
      params: { userId },
    });
  }

  /// GET /social/youtube/token-status?userId — statut par chaîne. Lecture
  /// passive : n'entraîne aucun refresh côté backend.
  getTokenStatus(userId: string): Observable<YouTubeTokenStatusResponse> {
    return this.http.get<YouTubeTokenStatusResponse>(
      '/social/youtube/token-status',
      { params: { userId } },
    );
  }

  /// URL du flux OAuth. Le backend répond par une REDIRECTION vers Google :
  /// elle doit être suivie par une navigation complète du navigateur, jamais
  /// par HttpClient (qui suivrait la redirection en XHR et échouerait).
  buildConnectUrl(userId: string): string {
    return youtubeConnectUrl(userId);
  }
}
