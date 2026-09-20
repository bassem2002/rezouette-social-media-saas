import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { formatBytes } from '@shared/utils/format';
import { LucideAngularModule, CheckCircle2, Trash2 } from '@/shared/ui/icons';

/// Aperçu d'un média téléversé (image ou vidéo) : miniature, nom, taille, suppression.
@Component({
  selector: 'app-image-preview-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  host: { class: 'block' },
  template: `
    <div class="flex items-center gap-3 rounded-xl border border-border bg-white p-3">
      @if (isVideo()) {
        <video
          [src]="src()"
          muted
          playsinline
          preload="metadata"
          class="size-16 shrink-0 rounded-lg border border-border object-cover"
        ></video>
      } @else {
        <img
          [src]="src()"
          alt="Aperçu de l'image sélectionnée"
          class="size-16 shrink-0 rounded-lg border border-border object-cover"
        />
      }
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-medium text-foreground">
          {{ filename() ?? (isVideo() ? 'Vidéo' : 'Image') }}
        </p>
        <div class="mt-0.5 flex items-center gap-2 text-xs text-muted">
          @if (size() != null) {
            <span>{{ formatBytes(size()!) }}</span>
          }
          @if (uploaded()) {
            <span class="inline-flex items-center gap-1 text-[#15803d]">
              <lucide-icon [img]="CheckIcon" class="size-3.5" />
              Téléversée
            </span>
          }
        </div>
      </div>
      <button
        type="button"
        (click)="remove.emit()"
        aria-label="Supprimer l'image"
        class="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-error-soft hover:text-[#b91c1c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error"
      >
        <lucide-icon [img]="TrashIcon" class="size-4" />
      </button>
    </div>
  `,
})
export class ImagePreviewCardComponent {
  readonly src = input.required<string>();
  readonly filename = input<string | undefined>(undefined);
  readonly size = input<number | undefined>(undefined);
  readonly uploaded = input(false);
  readonly isVideo = input(false);
  readonly remove = output<void>();

  protected readonly formatBytes = formatBytes;
  protected readonly CheckIcon = CheckCircle2;
  protected readonly TrashIcon = Trash2;
}
