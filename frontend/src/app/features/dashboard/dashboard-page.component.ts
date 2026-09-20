import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { lastValueFrom } from 'rxjs';
import { PageHeaderComponent } from '@shared/components/page-header.component';
import { ErrorStateComponent } from '@shared/components/states';
import { CardComponent } from '@/shared/ui/card.component';
import { ButtonComponent } from '@/shared/ui/button.component';
import { BadgeComponent } from '@/shared/ui/badge.component';
import { SkeletonComponent } from '@/shared/ui/skeleton.component';
import { SelectDirective } from '@shared/directives/select.directive';
import { PlatformIconComponent } from '@shared/components/platform-icon.component';
import {
  DonutChartComponent,
  StackedBarChartComponent,
  type StackedPoint,
  type StackedSeries,
} from '@shared/components/charts/charts';
import {
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileText,
  Link2,
  LucideAngularModule,
  Plus,
  RefreshCw,
  Send,
  XCircle,
} from '@/shared/ui/icons';
import { DashboardService } from '@core/data-access/dashboard.service';
import { queryKeys } from '@core/data-access/query-keys';
import { appConfig } from '@/core/config/app-config';
import type {
  ChartPoint,
  DashboardAnalyticsResponse,
  DashboardRange,
} from '@core/models';
import { DASHBOARD_RANGES } from '@core/models';
import { formatDateTime, formatNumber } from '@shared/utils/format';
import { DashboardKpiCardComponent } from './dashboard-kpi-card.component';
import {
  platformColor,
  platformIconKey,
  platformLabel,
  statusColor,
  statusLabel,
  statusTone,
} from './dashboard-labels';

/// Libellés du sélecteur de période (les valeurs sont celles du backend).
const RANGE_LABELS: Record<DashboardRange, string> = {
  '7d': '7 derniers jours',
  '30d': '30 derniers jours',
  '90d': '90 derniers jours',
};

/// Libellé d'axe (JJ/MM) construit à partir de la clé `YYYY-MM-DD` SANS passer
/// par `new Date` : cette chaîne serait interprétée en UTC et décalerait tous
/// les jours d'un cran dans les fuseaux négatifs.
function dayLabel(date: string): string {
  const [, month, day] = date.split('-');
  return month && day ? `${day}/${month}` : date;
}

/// Vue d'ensemble de l'activité : KPI, séries temporelles, répartitions,
/// activité récente, planifications à venir et santé des connexions.
///
/// Toutes les valeurs proviennent d'un unique appel à `/analytics/dashboard`,
/// c'est-à-dire des données locales de Rezouette. Aucune statistique n'est
/// fabriquée côté frontend.
@Component({
  selector: 'app-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    PageHeaderComponent,
    ErrorStateComponent,
    CardComponent,
    ButtonComponent,
    BadgeComponent,
    SkeletonComponent,
    SelectDirective,
    PlatformIconComponent,
    DonutChartComponent,
    StackedBarChartComponent,
    DashboardKpiCardComponent,
    LucideAngularModule,
  ],
  templateUrl: './dashboard-page.component.html',
})
export class DashboardPage {
  private readonly dashboardService = inject(DashboardService);
  private readonly router = inject(Router);

  protected readonly FileIcon = FileText;
  protected readonly CheckIcon = CheckCircle2;
  protected readonly XIcon = XCircle;
  protected readonly ClockIcon = Clock;
  protected readonly CalendarIcon = CalendarClock;
  protected readonly LinkIcon = Link2;
  protected readonly RefreshIcon = RefreshCw;
  protected readonly PlusIcon = Plus;
  protected readonly SendIcon = Send;
  protected readonly ChevronDownIcon = ChevronDown;

  protected readonly ranges = DASHBOARD_RANGES;
  protected readonly rangeLabels = RANGE_LABELS;
  protected readonly range = signal<DashboardRange>('7d');

  protected readonly platformLabel = platformLabel;
  protected readonly statusLabel = statusLabel;
  protected readonly statusTone = statusTone;
  protected readonly platformIconKey = platformIconKey;
  protected readonly formatDateTime = formatDateTime;
  protected readonly formatNumber = formatNumber;

  /// La période fait partie de la clé de cache : changer de fenêtre déclenche
  /// une vraie requête. `placeholderData` conserve l'affichage précédent
  /// pendant ce rechargement — l'écran ne clignote pas et ne retombe pas sur
  /// des squelettes à chaque changement de filtre.
  protected readonly query = injectQuery(() => ({
    queryKey: queryKeys.dashboard.overview(appConfig.demoUserId, this.range()),
    queryFn: () =>
      lastValueFrom(
        this.dashboardService.getDashboardAnalytics(
          appConfig.demoUserId,
          this.range(),
        ),
      ),
    placeholderData: (previous?: DashboardAnalyticsResponse) => previous,
  }));

  private readonly data = computed(() => this.query.data() ?? null);

  protected readonly summary = computed(
    () =>
      this.data()?.summary ?? {
        totalPosts: 0,
        published: 0,
        failed: 0,
        pending: 0,
        scheduled: 0,
        connectedAccounts: 0,
        reconnectRequired: 0,
        successRate: 0,
      },
  );

  /// Sous-texte du taux de réussite. Tant qu'aucune publication n'est tranchée,
  /// on annonce l'absence de mesure plutôt qu'un « 0 % » trompeur.
  protected readonly successHint = computed(() => {
    const { published, failed, successRate } = this.summary();
    if (published + failed === 0) return 'Aucune publication tranchée';
    return `${successRate} % de réussite`;
  });

  protected readonly reconnectHint = computed(() => {
    const count = this.summary().reconnectRequired;
    if (count === 0) return 'Aucune action requise';
    return count === 1 ? '1 reconnexion requise' : `${count} reconnexions requises`;
  });

  protected readonly hasData = computed(() => this.summary().totalPosts > 0);

  /// Séries du graphique quotidien. Deux jeux distincts pour ne pas surcharger
  /// une même trame : le volume d'un côté, l'issue des publications de l'autre.
  protected readonly volumeSeries: StackedSeries[] = [
    { key: 'total', label: 'Publications', color: '#ff3b18' },
  ];
  protected readonly outcomeSeries: StackedSeries[] = [
    { key: 'published', label: 'Publiées', color: statusColor('PUBLISHED') },
    { key: 'failed', label: 'Échecs', color: statusColor('FAILED') },
    { key: 'pending', label: 'En traitement', color: statusColor('PENDING') },
  ];

  protected readonly dailyPoints = computed<StackedPoint[]>(() =>
    (this.data()?.daily ?? []).map((d) => ({
      label: dayLabel(d.date),
      values: {
        total: d.total,
        published: d.published,
        failed: d.failed,
        pending: d.pending,
      },
    })),
  );

  /// Donut des plateformes : seules celles ayant au moins une publication sont
  /// tracées (une part à 0 n'est pas dessinable) ; le tableau de bord affiche
  /// les cinq plateformes dans la légende détaillée juste en dessous.
  protected readonly platformChart = computed<ChartPoint[]>(() =>
    (this.data()?.byPlatform ?? [])
      .filter((p) => p.total > 0)
      .map((p) => ({
        label: platformLabel(p.platform),
        value: p.total,
        color: platformColor(p.platform),
      })),
  );

  protected readonly platformRows = computed(() => this.data()?.byPlatform ?? []);

  protected readonly statusChart = computed<ChartPoint[]>(() =>
    (this.data()?.byStatus ?? [])
      .filter((s) => s.count > 0)
      .map((s) => ({
        label: statusLabel(s.status),
        value: s.count,
        color: statusColor(s.status),
      })),
  );

  protected readonly recentActivity = computed(
    () => this.data()?.recentActivity ?? [],
  );
  protected readonly upcoming = computed(
    () => this.data()?.upcomingScheduled ?? [],
  );

  /// Santé des connexions : on ne montre que les plateformes réellement
  /// connectées — une ligne « 0 compte » n'apprend rien.
  protected readonly accountHealth = computed(() =>
    (this.data()?.accountHealth ?? []).filter((h) => h.total > 0),
  );

  protected readonly hasAccounts = computed(
    () => this.accountHealth().length > 0,
  );

  protected onRangeChange(value: string): void {
    // Garde-fou : seule une valeur du contrat backend est retenue. Une valeur
    // inattendue laisse la période inchangée plutôt que de provoquer un 400.
    if ((DASHBOARD_RANGES as readonly string[]).includes(value)) {
      this.range.set(value as DashboardRange);
    }
  }

  protected goToPublication(): void {
    void this.router.navigateByUrl('/publication');
  }
}
