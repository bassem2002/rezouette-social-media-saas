import { HttpClient, HttpEventType } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { filter, map, type Observable } from 'rxjs';
import type { UploadResponse } from '@core/models';

/// Événement d'upload : progression (%) puis réponse finale.
export type UploadEvent =
  | { kind: 'progress'; percent: number }
  | { kind: 'done'; response: UploadResponse };

/// Upload d'image vers le backend (multipart/form-data) avec progression.
/// HttpClient pose automatiquement le bon Content-Type multipart pour un
/// `FormData` (équivalent du `Content-Type: undefined` côté axios).
@Injectable({ providedIn: 'root' })
export class MediaService {
  private readonly http = inject(HttpClient);

  /// POST /media/upload — renvoie un flux d'événements (progression + réponse).
  upload(file: File): Observable<UploadEvent> {
    const form = new FormData();
    form.append('file', file);

    return this.http
      .post<UploadResponse>('/media/upload', form, {
        reportProgress: true,
        observe: 'events',
      })
      .pipe(
        filter(
          (event) =>
            event.type === HttpEventType.UploadProgress ||
            event.type === HttpEventType.Response,
        ),
        map((event): UploadEvent => {
          if (event.type === HttpEventType.UploadProgress) {
            const percent = event.total
              ? Math.round((event.loaded / event.total) * 100)
              : 0;
            return { kind: 'progress', percent };
          }
          if (event.type === HttpEventType.Response) {
            return { kind: 'done', response: event.body as UploadResponse };
          }
          // Inatteignable : le filtre ne laisse passer que progress/response.
          return { kind: 'progress', percent: 0 };
        }),
      );
  }
}
