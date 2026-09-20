import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { BadgeComponent, type BadgeTone } from '@/shared/ui/badge.component';
import {
  LucideAngularModule,
  CheckCircle2,
  Clock,
  XCircle,
  type LucideIconData,
} from '@/shared/ui/icons';
import type { PostStatus } from '@core/models';

interface BadgeConfig {
  tone: BadgeTone;
  label: string;
  icon: LucideIconData;
}

const postStatusConfig: Record<PostStatus, BadgeConfig> = {
  PUBLISHED: { tone: 'success', label: 'Publié', icon: CheckCircle2 },
  FAILED: { tone: 'error', label: 'Échec', icon: XCircle },
  PENDING: { tone: 'warning', label: 'En attente', icon: Clock },
};

/// Badge de statut d'une publication (couleur + icône + libellé = redondance
/// d'information → ne dépend pas seulement de la couleur, accessibilité).
@Component({
  selector: 'app-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  imports: [BadgeComponent, LucideAngularModule],
  template: `
    <app-badge [tone]="config().tone">
      <lucide-icon badgeIcon [img]="config().icon" class="size-3.5" />
      {{ config().label }}
    </app-badge>
  `,
})
export class StatusBadgeComponent {
  readonly status = input.required<PostStatus>();
  protected readonly config = computed(() => postStatusConfig[this.status()]);
}
