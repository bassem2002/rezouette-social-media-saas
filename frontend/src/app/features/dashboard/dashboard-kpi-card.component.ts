import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { cn } from '@shared/utils/utils';
import { LucideAngularModule, type LucideIconData } from '@/shared/ui/icons';
import { formatNumber } from '@shared/utils/format';

export type KpiTone = 'neutral' | 'primary' | 'success' | 'error' | 'warning';

/// Pastille d'icône par tonalité — fond doux, jamais d'aplat saturé.
const TONE_CLASSES: Record<KpiTone, string> = {
  neutral: 'bg-muted-soft text-muted',
  primary: 'bg-primary-soft text-primary',
  success: 'bg-success-soft text-success',
  error: 'bg-error-soft text-error',
  warning: 'bg-warning-soft text-warning',
};

/// Carte KPI compacte : libellé, valeur, icône, sous-texte optionnel.
///
/// `hint` n'est affiché que s'il est fourni : aucune variation, aucun
/// pourcentage n'est calculé ici. Une carte n'invente jamais de tendance —
/// si le backend ne la fournit pas, elle n'existe pas.
@Component({
  selector: 'app-dashboard-kpi-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  imports: [LucideAngularModule],
  template: `
    <div
      class="flex h-full flex-col justify-between gap-3 rounded-xl border border-border bg-white p-4 shadow-subtle"
    >
      <div class="flex items-start justify-between gap-2">
        <p class="text-[13px] font-medium text-muted">{{ label() }}</p>
        <span [class]="iconClasses()">
          <lucide-icon [img]="icon()" class="size-4" aria-hidden="true" />
        </span>
      </div>
      <div>
        <p class="text-2xl font-semibold tracking-tight text-foreground">
          {{ display() }}
        </p>
        @if (hint()) {
          <p class="mt-0.5 text-xs text-subtle">{{ hint() }}</p>
        }
      </div>
    </div>
  `,
})
export class DashboardKpiCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<number>();
  readonly icon = input.required<LucideIconData>();
  readonly tone = input<KpiTone>('neutral');
  readonly hint = input<string | null>(null);

  /// `Number.isFinite` protège l'affichage : une valeur absente ou NaN devient
  /// « — » plutôt qu'un « NaN » affiché dans une carte.
  protected readonly display = computed(() => {
    const value = this.value();
    return Number.isFinite(value) ? formatNumber(value) : '—';
  });

  protected readonly iconClasses = computed(() =>
    cn(
      'flex size-8 shrink-0 items-center justify-center rounded-md',
      TONE_CLASSES[this.tone()],
    ),
  );
}
