import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import type { ConnectedAccount } from '@core/models';

/// Comptes sociaux connectés du user.
@Injectable({ providedIn: 'root' })
export class AccountsService {
  private readonly http = inject(HttpClient);

  /// GET /social/accounts?userId — comptes persistés (sans tokens).
  list(userId: string): Observable<ConnectedAccount[]> {
    return this.http.get<ConnectedAccount[]>('/social/accounts', {
      params: { userId },
    });
  }
}
