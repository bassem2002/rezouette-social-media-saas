import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { cn } from '@shared/utils/utils';

/// Glyphes de marque (lucide ne fournit pas Facebook/Instagram/TikTok pour
/// raisons de marque). SVG inline minimalistes, colorés via `currentColor`.
@Component({
  selector: 'app-platform-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `
    @switch (kind()) {
      @case ('facebook') {
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" [attr.class]="iconClass()">
          <path
            d="M14 9h3l.4-3H14V4.2c0-.9.3-1.5 1.6-1.5H17V.1C16.7.1 15.6 0 14.4 0 11.9 0 10.2 1.5 10.2 4.3V6H7.3v3h2.9v9H14V9z"
          />
        </svg>
      }
      @case ('tiktok') {
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" [attr.class]="iconClass()">
          <path
            d="M16.6 5.82a4.28 4.28 0 0 1-1.05-2.82h-3.1v12.3a2.59 2.59 0 0 1-2.59 2.5 2.59 2.59 0 0 1-2.59-2.59 2.59 2.59 0 0 1 3.4-2.46V9.58a5.7 5.7 0 0 0-.81-.06A5.68 5.68 0 0 0 4.2 15.2a5.68 5.68 0 0 0 5.68 5.68 5.68 5.68 0 0 0 5.68-5.68V9.01a7.35 7.35 0 0 0 4.29 1.37V7.28a4.28 4.28 0 0 1-3.25-1.46z"
          />
        </svg>
      }
      @case ('linkedin') {
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" [attr.class]="iconClass()">
          <path
            d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9h4v12H3V9zm7 0h3.8v1.7h.05c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.78 2.65 4.78 6.1V21h-4v-5.4c0-1.29-.02-2.95-1.8-2.95-1.8 0-2.08 1.4-2.08 2.85V21h-4V9z"
          />
        </svg>
      }
      @case ('youtube') {
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" [attr.class]="iconClass()">
          <path
            d="M23.5 6.9a3 3 0 0 0-2.12-2.13C19.5 4.25 12 4.25 12 4.25s-7.5 0-9.38.52A3 3 0 0 0 .5 6.9C0 8.78 0 12 0 12s0 3.22.5 5.1a3 3 0 0 0 2.12 2.13c1.88.52 9.38.52 9.38.52s7.5 0 9.38-.52a3 3 0 0 0 2.12-2.13C24 15.22 24 12 24 12s0-3.22-.5-5.1zM9.6 15.6V8.4l6.24 3.6-6.24 3.6z"
          />
        </svg>
      }
      @default {
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          [attr.class]="iconClass()"
        >
          <rect x="2" y="2" width="20" height="20" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
        </svg>
      }
    }
  `,
})
export class PlatformIconComponent {
  readonly platform = input.required<string>();
  readonly className = input('');

  /// Normalise la plateforme (insensible à la casse) en clé de glyphe.
  protected readonly kind = computed(() => this.platform().toLowerCase());
  protected readonly iconClass = computed(() => cn('size-4', this.className()));
}
