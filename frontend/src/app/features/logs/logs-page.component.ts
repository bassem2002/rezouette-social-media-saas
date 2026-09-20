import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FrontendPreviewNoticeComponent } from '@shared/components/frontend-preview-notice.component';
import { FilterSelectComponent } from '@shared/components/filter-select.component';
import { SearchBarComponent } from '@shared/components/search-bar.component';
import { BadgeComponent } from '@/shared/ui/badge.component';
import {
  LucideAngularModule,
  ChevronRight,
  Download,
  FileText,
  Radio,
  RefreshCw,
  Settings,
} from '@/shared/ui/icons';
import { ToastService } from '@core/services/toast.service';
import {
  PREVIEW_BADGE,
  PREVIEW_MESSAGES,
  previewLogFacets,
  previewLogStatuses,
  previewLogTimelines,
  previewLogTypes,
  previewLogs,
  type PreviewLogEntry,
} from '@/core/config/frontend-preview.config';

/// Aperçu de la page « Logs ».
///
/// ÉCRAN 100 % FRONTEND : pas de polling, pas de websocket, pas de SSE. Le
/// commutateur « Live » ne fait que basculer un état visuel — le présenter comme
/// un flux temps réel alors qu'aucune source n'existe serait le plus trompeur
/// des raccourcis. Aucune entrée de journal n'est inventée.
@Component({
  selector: 'app-logs-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FrontendPreviewNoticeComponent,
    FilterSelectComponent,
    SearchBarComponent,
    BadgeComponent,
    LucideAngularModule,
  ],
  templateUrl: './logs-page.component.html',
})
export class LogsPage {
  private readonly toast = inject(ToastService);

  protected readonly ChevronRightIcon = ChevronRight;
  protected readonly DownloadIcon = Download;
  protected readonly RefreshIcon = RefreshCw;
  protected readonly LiveIcon = Radio;
  protected readonly FileIcon = FileText;
  protected readonly FiltersIcon = Settings;

  protected readonly previewBadge = PREVIEW_BADGE;
  protected readonly timelines = previewLogTimelines;
  protected readonly statuses = previewLogStatuses;
  protected readonly types = previewLogTypes;
  protected readonly facets = previewLogFacets;

  protected readonly search = signal('');
  protected readonly timeline = signal<string>('7d');
  protected readonly selectedStatuses = signal<ReadonlySet<string>>(new Set());
  protected readonly selectedTypes = signal<ReadonlySet<string>>(new Set());
  protected readonly expandedFacets = signal<ReadonlySet<string>>(new Set());

  /// Visible sur tablette et mobile uniquement : le panneau de filtres est
  /// toujours affiché en desktop.
  protected readonly filtersOpen = signal(false);
  protected readonly live = signal(false);

  /// Jeu de données de session. Vide par construction — le service d'audit
  /// n'existe pas encore.
  protected readonly logs = signal<readonly PreviewLogEntry[]>(previewLogs);

  protected readonly rows = computed(() => {
    const term = this.search().trim().toLowerCase();
    const statuses = this.selectedStatuses();
    const types = this.selectedTypes();

    return this.logs().filter((entry) => {
      if (term && !entry.message.toLowerCase().includes(term)) return false;
      if (statuses.size > 0 && !statuses.has(entry.status)) return false;
      if (types.size > 0 && !types.has(entry.activity)) return false;
      return true;
    });
  });

  protected readonly hasRows = computed(() => this.rows().length > 0);

  protected readonly activeFilterCount = computed(
    () => this.selectedStatuses().size + this.selectedTypes().size,
  );

  protected isStatusSelected(value: string): boolean {
    return this.selectedStatuses().has(value);
  }

  protected isTypeSelected(value: string): boolean {
    return this.selectedTypes().has(value);
  }

  protected toggleStatus(value: string): void {
    this.selectedStatuses.update((current) => toggle(current, value));
  }

  protected toggleType(value: string): void {
    this.selectedTypes.update((current) => toggle(current, value));
  }

  protected isFacetOpen(id: string): boolean {
    return this.expandedFacets().has(id);
  }

  protected toggleFacet(id: string): void {
    this.expandedFacets.update((current) => toggle(current, id));
  }

  protected reset(): void {
    this.search.set('');
    this.timeline.set('7d');
    this.selectedStatuses.set(new Set());
    this.selectedTypes.set(new Set());
  }

  /// Bascule PUREMENT visuelle : aucun intervalle n'est démarré, aucune
  /// connexion n'est ouverte.
  protected toggleLive(): void {
    const next = !this.live();
    this.live.set(next);
    this.toast.info(
      next
        ? 'Mode Live simulé : aucun flux temps réel n’est connecté.'
        : 'Mode Live désactivé.',
    );
  }

  protected refresh(): void {
    this.logs.set(previewLogs);
    this.toast.info(PREVIEW_MESSAGES.logs);
  }

  protected download(): void {
    this.toast.info(PREVIEW_MESSAGES.logsExport);
  }
}

/// Ajoute ou retire une valeur d'un ensemble, en renvoyant un NOUVEL ensemble
/// (les signaux ne détectent pas la mutation d'une même référence).
function toggle(current: ReadonlySet<string>, value: string): ReadonlySet<string> {
  const next = new Set(current);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}
