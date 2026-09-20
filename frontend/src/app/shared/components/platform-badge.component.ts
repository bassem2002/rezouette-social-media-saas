import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { cn } from '@shared/utils/utils';
import { BadgeComponent } from '@/shared/ui/badge.component';
import { PlatformIconComponent } from './platform-icon.component';

const PLATFORM_LABELS: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
};

/// Couleur d'accent de l'icône par plateforme (le fond du badge reste neutre).
const PLATFORM_ICON_COLORS: Record<string, string> = {
  facebook: 'text-primary',
  instagram: 'text-warning',
  tiktok: 'text-foreground',
  linkedin: 'text-primary',
  youtube: 'text-error',
};

/// Badge plateforme : badge neutre + icône de marque colorée (la couleur est
/// portée par l'icône, pas le fond → règle "max 2 couleurs d'accent").
@Component({
  selector: 'app-platform-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  imports: [BadgeComponent, PlatformIconComponent],
  template: `
    <app-badge tone="muted">
      <app-platform-icon badgeIcon [platform]="platform()" [className]="iconClass()" />
      {{ label() }}
    </app-badge>
  `,
})
export class PlatformBadgeComponent {
  readonly platform = input.required<string>();

  protected readonly kind = computed(() => this.platform().toLowerCase());
  protected readonly label = computed(
    () => PLATFORM_LABELS[this.kind()] ?? this.platform(),
  );
  protected readonly iconClass = computed(() =>
    cn('size-3.5', PLATFORM_ICON_COLORS[this.kind()] ?? 'text-muted'),
  );
}
