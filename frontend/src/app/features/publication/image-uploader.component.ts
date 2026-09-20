import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
  type ElementRef,
} from '@angular/core';
import type { Subscription } from 'rxjs';
import { cn } from '@shared/utils/utils';
import { MediaService } from '@core/data-access/media.service';
import { acceptAttrFor, validateMediaFile, type MediaKind } from '@shared/utils/upload';
import { ToastService } from '@core/services/toast.service';
import { UploadProgressComponent } from '@shared/components/upload-progress.component';
import { ImagePreviewCardComponent } from '@shared/components/image-preview-card.component';
import { LucideAngularModule, UploadCloud } from '@/shared/ui/icons';

type Status = 'idle' | 'uploading' | 'success' | 'error';

/// Uploader de média (image ou vidéo selon `kind`) : drag & drop + sélection
/// fichier, validation client, progression, aperçu et suppression. Au succès,
/// remonte l'URL publique via `valueChange` (stockée dans le formulaire et
/// envoyée à /social/publish comme imageUrl ou videoUrl).
@Component({
  selector: 'app-image-uploader',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UploadProgressComponent, ImagePreviewCardComponent, LucideAngularModule],
  templateUrl: './image-uploader.component.html',
})
export class ImageUploaderComponent {
  private readonly media = inject(MediaService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly value = input('');
  readonly error = input<string | undefined>(undefined);
  readonly kind = input<MediaKind>('image');
  readonly valueChange = output<string>();
  readonly uploadingChange = output<boolean>();

  private readonly fileInput =
    viewChild<ElementRef<HTMLInputElement>>('fileInput');

  protected readonly UploadIcon = UploadCloud;
  protected readonly isVideo = computed(() => this.kind() === 'video');
  protected readonly acceptAttr = computed(() => acceptAttrFor(this.kind()));
  protected readonly dropzoneTitle = computed(() =>
    this.isVideo()
      ? 'Glissez une vidéo ici, ou cliquez pour parcourir'
      : 'Glissez une image ici, ou cliquez pour parcourir',
  );
  protected readonly dropzoneHint = computed(() =>
    this.isVideo() ? 'MP4, MOV ou WEBM · 100 Mo maximum' : 'JPEG, PNG ou WEBP · 10 Mo maximum',
  );

  protected readonly status = signal<Status>('idle');
  protected readonly progress = signal(0);
  protected readonly preview = signal<string | null>(null);
  protected readonly meta = signal<{ name: string; size: number } | null>(null);
  protected readonly uploadError = signal<string | null>(null);
  protected readonly dragging = signal(false);

  private objectUrl: string | null = null;
  private uploadSub: Subscription | null = null;

  protected readonly displayError = computed(
    () => this.uploadError() ?? this.error() ?? null,
  );

  protected readonly dropzoneClasses = computed(() =>
    cn(
      'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors duration-150',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
      this.dragging()
        ? 'border-primary bg-primary-soft'
        : 'border-border bg-card hover:bg-muted-soft',
    ),
  );

  constructor() {
    // Remonte l'état d'upload au parent (désactive le bouton Publier).
    effect(() => this.uploadingChange.emit(this.status() === 'uploading'));

    // Réinitialise lorsque le parent vide la valeur (ex. après publication).
    effect(() => {
      if (this.value() === '' && this.status() === 'success') this.resetState();
    });

    this.destroyRef.onDestroy(() => {
      this.uploadSub?.unsubscribe();
      this.revokePreview();
    });
  }

  protected openPicker(): void {
    this.fileInput()?.nativeElement.click();
  }

  protected onInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.handleFile(file);
    input.value = '';
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) this.handleFile(file);
  }

  protected onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.openPicker();
    }
  }

  protected remove(): void {
    this.resetState();
    this.valueChange.emit('');
  }

  private handleFile(file: File): void {
    const validationError = validateMediaFile(file, this.kind());
    if (validationError) {
      this.status.set('error');
      this.preview.set(null);
      this.uploadError.set(validationError);
      this.toast.error(validationError);
      this.valueChange.emit('');
      return;
    }

    this.revokePreview();
    const localUrl = URL.createObjectURL(file);
    this.objectUrl = localUrl;
    this.preview.set(localUrl);
    this.meta.set({ name: file.name, size: file.size });
    this.uploadError.set(null);
    this.progress.set(0);
    this.status.set('uploading');

    this.uploadSub?.unsubscribe();
    this.uploadSub = this.media.upload(file).subscribe({
      next: (event) => {
        if (event.kind === 'progress') {
          this.progress.set(event.percent);
        } else {
          this.status.set('success');
          this.meta.set({
            name: event.response.filename,
            size: event.response.size,
          });
          this.valueChange.emit(event.response.url);
          this.toast.success(this.isVideo() ? 'Vidéo téléversée.' : 'Image téléversée.');
        }
      },
      error: () => {
        this.status.set('error');
        this.uploadError.set(
          'Échec du téléversement. Vérifiez votre connexion et réessayez.',
        );
        this.valueChange.emit('');
        this.toast.error(
          this.isVideo()
            ? 'Échec du téléversement de la vidéo.'
            : "Échec du téléversement de l'image.",
        );
      },
    });
  }

  private resetState(): void {
    this.revokePreview();
    this.status.set('idle');
    this.progress.set(0);
    this.preview.set(null);
    this.meta.set(null);
    this.uploadError.set(null);
  }

  private revokePreview(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }
}
