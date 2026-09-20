import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import {
  CardComponent,
  CardHeaderComponent,
  CardTitleComponent,
  CardContentComponent,
} from '@/shared/ui/card.component';
import { PlatformIconComponent } from '@shared/components/platform-icon.component';
import { LucideAngularModule, ImageOff, Link2 } from '@/shared/ui/icons';
import { YOUTUBE_PRIVACY_LABELS, type YouTubePrivacyStatus } from '@core/models';

/// Prévisualisation live du post (texte + image), pour vérifier avant publication.
@Component({
  selector: 'app-post-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CardComponent,
    CardHeaderComponent,
    CardTitleComponent,
    CardContentComponent,
    PlatformIconComponent,
    LucideAngularModule,
  ],
  template: `
    <app-card>
      <app-card-header><app-card-title>Prévisualisation</app-card-title></app-card-header>
      <app-card-content className="space-y-3">
        <div class="overflow-hidden rounded-xl border border-border bg-white">
          <div class="flex items-center gap-2 border-b border-border p-3">
            <span class="flex size-8 items-center justify-center rounded-full bg-muted-soft text-muted">
              <app-platform-icon [platform]="primaryPlatform()" className="size-4" />
            </span>
            <div class="leading-tight">
              <p class="text-sm font-medium text-foreground">Votre marque</p>
              <p class="text-xs text-muted">{{ audience() }}</p>
            </div>
          </div>

          @if (youtube()) {
            <!-- Variante YouTube : une vidéo se présente par son titre et sa
                 description, pas comme un fil de texte. -->
            <div class="space-y-2 px-3 py-3">
              @if (youtubeTitle().trim()) {
                <p class="text-sm font-semibold text-foreground">{{ youtubeTitle() }}</p>
              } @else {
                <p class="text-sm italic text-muted">Titre de la vidéo…</p>
              }
              @if (youtubeDescription().trim()) {
                <p class="whitespace-pre-wrap text-sm text-muted">{{ youtubeDescription() }}</p>
              }
              <div class="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted">
                <span class="rounded-full bg-muted-soft px-2 py-0.5">
                  {{ privacyLabel() }}
                </span>
                <span class="rounded-full bg-muted-soft px-2 py-0.5">
                  {{ kidsLabel() }}
                </span>
              </div>
              @if (youtubeTags().length > 0) {
                <p class="text-xs text-muted">
                  Tags : {{ youtubeTags().join(', ') }}
                </p>
              }
            </div>
          } @else if (previewText()) {
            <p class="whitespace-pre-wrap px-3 py-3 text-sm text-foreground">{{ previewText() }}</p>
          } @else {
            <p class="px-3 py-3 text-sm italic text-muted">Votre texte apparaîtra ici…</p>
          }

          @if (linkUrl()) {
            <div class="mx-3 mb-3 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted">
              <lucide-icon [img]="LinkIcon" class="size-3.5 shrink-0" />
              <span class="truncate">{{ linkUrl() }}</span>
            </div>
          }

          @if (videoUrl()) {
            <video
              [src]="videoUrl()"
              controls
              muted
              playsinline
              preload="metadata"
              class="max-h-72 w-full bg-black object-contain"
            ></video>
          } @else if (imageUrl() && !imageError()) {
            <img
              [src]="imageUrl()"
              alt="Aperçu du média à publier"
              (error)="imageError.set(true)"
              class="max-h-72 w-full object-cover"
            />
          } @else if (imageUrl() && imageError()) {
            <div class="flex items-center justify-center gap-2 border-t border-border bg-card py-8 text-sm text-muted">
              <lucide-icon [img]="ImageOffIcon" class="size-4" />
              Image inaccessible
            </div>
          } @else if (youtube()) {
            <!-- Aucune vidéo sélectionnée : placeholder LOCAL, jamais une
                 miniature distante fabriquée. -->
            <div class="flex items-center justify-center gap-2 border-t border-border bg-card py-10 text-sm text-muted">
              <app-platform-icon platform="youtube" className="size-5 text-error" />
              Ajoutez une vidéo pour l’aperçu
            </div>
          }

          @if (youtube()) {
            <p class="border-t border-border bg-card px-3 py-2 text-xs text-muted">
              Après l’envoi, YouTube traite la vidéo : elle n’est visible qu’une
              fois ce traitement terminé.
            </p>
          }
        </div>
      </app-card-content>
    </app-card>
  `,
})
export class PostPreviewComponent {
  readonly facebook = input.required<boolean>();
  readonly instagram = input.required<boolean>();
  readonly tiktok = input(false);
  readonly linkedin = input(false);
  readonly youtube = input(false);
  readonly message = input.required<string>();
  readonly caption = input.required<string>();
  readonly imageUrl = input.required<string>();
  readonly videoUrl = input('');
  readonly linkUrl = input('');
  readonly youtubeTitle = input('');
  readonly youtubeDescription = input('');
  readonly youtubeTags = input<string[]>([]);
  readonly youtubePrivacyStatus = input<YouTubePrivacyStatus>('private');
  /// `null` = déclaration COPPA non posée : l'aperçu le dit explicitement.
  readonly youtubeMadeForKids = input<boolean | null>(null);

  protected readonly ImageOffIcon = ImageOff;
  protected readonly LinkIcon = Link2;
  protected readonly imageError = signal(false);

  protected readonly privacyLabel = computed(
    () => YOUTUBE_PRIVACY_LABELS[this.youtubePrivacyStatus()],
  );
  protected readonly kidsLabel = computed(() => {
    const value = this.youtubeMadeForKids();
    if (value === null) return 'Public enfants : non déclaré';
    return value ? 'Destiné aux enfants' : 'Pas destiné aux enfants';
  });

  protected readonly primaryPlatform = computed(() => {
    // YouTube en premier : sa variante d'aperçu est la plus spécifique.
    if (this.youtube()) return 'youtube';
    if (this.facebook()) return 'facebook';
    if (this.instagram()) return 'instagram';
    if (this.tiktok()) return 'tiktok';
    if (this.linkedin()) return 'linkedin';
    return 'facebook';
  });
  // Facebook/LinkedIn privilégient le message ; Instagram et TikTok la légende.
  protected readonly previewText = computed(() =>
    this.facebook() || (this.linkedin() && !this.instagram() && !this.tiktok())
      ? this.message()
      : this.caption(),
  );
  protected readonly audience = computed(() => {
    const names: string[] = [];
    if (this.facebook()) names.push('Facebook');
    if (this.instagram()) names.push('Instagram');
    if (this.tiktok()) names.push('TikTok');
    if (this.linkedin()) names.push('LinkedIn');
    if (this.youtube()) names.push('YouTube');
    return names.join(' · ') || 'Aucune plateforme';
  });
}
