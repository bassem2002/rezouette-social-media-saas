import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { BadgeComponent } from '@/shared/ui/badge.component';
import { PlatformIconComponent } from '@shared/components/platform-icon.component';
import { LucideAngularModule, ImageOff, MoreVertical } from '@/shared/ui/icons';
import { formatDateTime } from '@shared/utils/format';
import {
  POST_GROUP_STATUS_CONFIG,
  postTitle,
  type PostGroup,
} from './post-group';

/// Carte d'une publication (toutes plateformes confondues).
///
/// N'affiche que des informations RÉELLES issues de l'historique. Les compteurs
/// d'engagement visibles dans la maquette (likes, vues, partages) ne sont
/// exposés par aucun endpoint : plutôt que d'afficher des zéros qui passeraient
/// pour des mesures, la carte montre le nombre de plateformes ciblées et l'état
/// de la diffusion — des faits, eux, vérifiables.
@Component({
  selector: 'app-post-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  imports: [BadgeComponent, PlatformIconComponent, LucideAngularModule],
  template: `
    <article
      class="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-subtle"
    >
      <div class="flex flex-1 gap-3 p-4">
        <div class="min-w-0 flex-1">
          <h3 class="truncate text-sm font-semibold text-foreground">
            {{ title() }}
          </h3>

          <div class="mt-2 flex items-center gap-1.5" [attr.aria-label]="platformsLabel()">
            @for (platform of group().platforms; track platform) {
              <app-platform-icon
                [platform]="platform.toLowerCase()"
                className="size-4 text-foreground"
              />
            }
          </div>

          <p class="mt-2 text-[13px] leading-snug text-muted">
            {{ dateLabel() }}
          </p>

          <p class="mt-2 truncate text-xs text-subtle">
            {{ shortId() }}
          </p>
        </div>

        <!-- Média réel uniquement ; sinon un emplacement neutre, jamais une
             image de remplacement qui ferait croire à un visuel publié. -->
        <div
          class="flex size-[88px] shrink-0 items-center justify-center overflow-hidden rounded-md border border-border-soft bg-card"
        >
          @if (group().mediaUrl) {
            <img
              [src]="group().mediaUrl"
              alt=""
              class="size-full object-cover"
              loading="lazy"
            />
          } @else {
            <lucide-icon
              [img]="NoImageIcon"
              class="size-5 text-subtle"
              aria-hidden="true"
            />
          }
        </div>
      </div>

      <div
        class="flex items-center justify-between gap-2 border-t border-border-soft px-4 py-2.5"
      >
        <div class="flex min-w-0 items-center gap-2">
          <app-badge [tone]="statusConfig().tone">
            {{ statusConfig().label }}
          </app-badge>
          <span class="truncate text-xs text-muted">
            {{ platformCountLabel() }}
          </span>
        </div>

        <button
          type="button"
          (click)="open.emit()"
          [attr.aria-label]="'Ouvrir le détail — ' + title()"
          class="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors duration-150 hover:bg-muted-soft hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <lucide-icon [img]="MoreIcon" class="size-4" />
        </button>
      </div>
    </article>
  `,
})
export class PostCardComponent {
  readonly group = input.required<PostGroup>();
  readonly open = output<void>();

  protected readonly MoreIcon = MoreVertical;
  protected readonly NoImageIcon = ImageOff;

  protected readonly title = computed(() => postTitle(this.group()));
  protected readonly statusConfig = computed(
    () => POST_GROUP_STATUS_CONFIG[this.group().status],
  );

  /// Date de publication si elle existe, sinon date de création — l'étiquette
  /// dit toujours laquelle est montrée.
  protected readonly dateLabel = computed(() => {
    const group = this.group();
    return group.publishedAt
      ? `Publié le ${formatDateTime(group.publishedAt)}`
      : `Créé le ${formatDateTime(group.createdAt)}`;
  });

  protected readonly platformsLabel = computed(
    () => `Plateformes : ${this.group().platforms.join(', ')}`,
  );

  protected readonly platformCountLabel = computed(() => {
    const count = this.group().platforms.length;
    return count === 1 ? '1 plateforme' : `${count} plateformes`;
  });

  /// Identifiant abrégé, à valeur de repère technique. Il est tronqué comme
  /// dans la maquette, jamais transformé en lien.
  protected readonly shortId = computed(
    () => `${this.group().displayId.slice(0, 8)}…`,
  );
}
