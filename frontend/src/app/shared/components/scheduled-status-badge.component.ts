import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { BadgeComponent, type BadgeTone } from '@/shared/ui/badge.component';
import {
  LucideAngularModule,
  Ban,
  CalendarClock,
  CheckCircle2,
  Loader,
  XCircle,
  type LucideIconData,
} from '@/shared/ui/icons';
import type { ScheduledPostStatus } from '@core/models';

interface BadgeConfig {
  tone: BadgeTone;
  label: string;
  icon: LucideIconData;
}

const scheduledStatusConfig: Record<ScheduledPostStatus, BadgeConfig> = {
  SCHEDULED: { tone: 'primary', label: 'Programmé', icon: CalendarClock },
  PROCESSING: { tone: 'warning', label: 'En cours', icon: Loader },
  PUBLISHED: { tone: 'success', label: 'Publié', icon: CheckCircle2 },
  FAILED: { tone: 'error', label: 'Échec', icon: XCircle },
  CANCELLED: { tone: 'muted', label: 'Annulé', icon: Ban },
};

/// Badge de statut d'une publication programmée (idem : couleur + icône + texte).
@Component({
  selector: 'app-scheduled-status-badge',
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
export class ScheduledStatusBadgeComponent {
  readonly status = input.required<ScheduledPostStatus>();
  protected readonly config = computed(
    () => scheduledStatusConfig[this.status()],
  );
}
