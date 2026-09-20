import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import type { PublishRequest, PublishResponse } from '@core/models';

/// Publication multi-réseaux via l'orchestrateur backend.
@Injectable({ providedIn: 'root' })
export class PublishService {
  private readonly http = inject(HttpClient);

  /// POST /social/publish — diffuse vers les plateformes sélectionnées.
  publish(payload: PublishRequest): Observable<PublishResponse> {
    return this.http.post<PublishResponse>('/social/publish', payload);
  }
}
