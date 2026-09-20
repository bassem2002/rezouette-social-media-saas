import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { PageHeaderComponent } from '@shared/components/page-header.component';
import { StatCardComponent } from '@shared/components/cards';
import { ErrorStateComponent, LoadingStateComponent } from '@shared/components/states';
import {
  CardComponent,
  CardHeaderComponent,
  CardTitleComponent,
  CardContentComponent,
} from '@/shared/ui/card.component';
import { BarChartComponent, DonutChartComponent, HBarChartComponent } from '@shared/components/charts/charts';
import { AnalyticsService } from '@core/data-access/analytics.service';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { lastValueFrom } from 'rxjs';
import { queryKeys } from '@core/data-access/query-keys';
import { appConfig } from '@/core/config/app-config';
import { chartColors } from '@shared/utils/metrics';
import { formatPercent } from '@shared/utils/format';
import type { ChartPoint } from '@core/models';

/// Libellés & couleurs par plateforme (répartition /analytics/platforms).
const PLATFORM_LABELS: Record<string, string> = {
  FACEBOOK: 'Facebook',
  INSTAGRAM: 'Instagram',
  TIKTOK: 'TikTok',
  LINKEDIN: 'LinkedIn',
  YOUTUBE: 'YouTube',
};
const PLATFORM_COLORS: Record<string, string> = {
  FACEBOOK: chartColors.facebook,
  INSTAGRAM: chartColors.instagram,
  TIKTOK: chartColors.tiktok,
  LINKEDIN: chartColors.linkedin,
  YOUTUBE: chartColors.youtube,
};

/// Réseaux que le backend n'inclut PAS (encore) dans la répartition par
/// plateforme (`REPORTED_PLATFORMS`). On ne fabrique surtout pas de bucket à
/// zéro — ce serait présenter une absence de mesure comme une mesure nulle.
/// Le code accepte néanmoins un bucket futur sans modification structurelle :
/// libellés et couleurs sont déjà là.
const PLATFORMS_WITHOUT_BREAKDOWN = ['LinkedIn', 'YouTube'] as const;

/// Couleurs des états programmés (cohérence avec les badges du Calendrier).
const SCHEDULED_COLORS = {
  scheduled: chartColors.primary,
  processing: chartColors.warning,
  published: chartColors.success,
  failed: chartColors.error,
  cancelled: '#94a3b8',
} as const;

/// Analytics avancés : KPI + 4 graphiques alimentés par l'API /analytics/*
/// (données réelles PostgreSQL, aucune donnée mockée).
@Component({
  selector: 'app-analytics-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PageHeaderComponent,
    StatCardComponent,
    ErrorStateComponent,
    LoadingStateComponent,
    CardComponent,
    CardHeaderComponent,
    CardTitleComponent,
    CardContentComponent,
    BarChartComponent,
    DonutChartComponent,
    HBarChartComponent,
  ],
  templateUrl: './analytics-page.component.html',
})
export class AnalyticsPage {
  private readonly analyticsService = inject(AnalyticsService);
  private readonly userId = appConfig.demoUserId;
  protected readonly primaryColor = chartColors.primary;

  protected readonly overview = injectQuery(() => ({
    queryKey: queryKeys.analytics('overview', this.userId),
    queryFn: () => lastValueFrom(this.analyticsService.overview(this.userId)),
  }));
  protected readonly platforms = injectQuery(() => ({
    queryKey: queryKeys.analytics('platforms', this.userId),
    queryFn: () => lastValueFrom(this.analyticsService.platforms(this.userId)),
  }));
  protected readonly errors = injectQuery(() => ({
    queryKey: queryKeys.analytics('errors', this.userId),
    queryFn: () => lastValueFrom(this.analyticsService.errors(this.userId)),
  }));
  protected readonly daily = injectQuery(() => ({
    queryKey: queryKeys.analytics('daily', this.userId),
    queryFn: () => lastValueFrom(this.analyticsService.daily(this.userId)),
  }));
  protected readonly scheduled = injectQuery(() => ({
    queryKey: queryKeys.analytics('scheduled', this.userId),
    queryFn: () => lastValueFrom(this.analyticsService.scheduled(this.userId)),
  }));

  protected readonly isLoading = computed(
    () =>
      this.overview.isPending() ||
      this.platforms.isPending() ||
      this.errors.isPending() ||
      this.daily.isPending() ||
      this.scheduled.isPending(),
  );
  protected readonly isError = computed(
    () =>
      this.overview.isError() ||
      this.platforms.isError() ||
      this.errors.isError() ||
      this.daily.isError() ||
      this.scheduled.isError(),
  );

  protected refetchAll(): void {
    this.overview.refetch();
    this.platforms.refetch();
    this.errors.refetch();
    this.daily.refetch();
    this.scheduled.refetch();
  }

  protected readonly successRate = computed(() =>
    formatPercent(this.overview.data()?.successRate ?? 0),
  );

  // Publications par jour (30 j) → libellés allégés (1 sur 5) pour rester lisible.
  protected readonly dailySeries = computed<ChartPoint[]>(() =>
    (this.daily.data()?.series ?? []).map((point, i) => ({
      label: i % 5 === 0 ? point.date.slice(8) + '/' + point.date.slice(5, 7) : '',
      value: point.count,
    })),
  );

  protected readonly platformSeries = computed<ChartPoint[]>(() =>
    (this.platforms.data()?.platforms ?? []).map((p) => ({
      label: PLATFORM_LABELS[p.platform] ?? p.platform,
      value: p.count,
      color: PLATFORM_COLORS[p.platform] ?? chartColors.primary,
    })),
  );

  /// Réseaux absents de la répartition renvoyée par le backend. Affichés comme
  /// une LIMITE connue, jamais comme une valeur à zéro.
  protected readonly missingBreakdownNotice = computed(() => {
    const reported = new Set(
      (this.platforms.data()?.platforms ?? []).map(
        (p) => PLATFORM_LABELS[p.platform] ?? p.platform,
      ),
    );
    const missing = PLATFORMS_WITHOUT_BREAKDOWN.filter(
      (label) => !reported.has(label),
    );
    if (missing.length === 0) return '';
    return `Répartition par plateforme non disponible pour ${missing.join(' et ')} : ces publications sont comptées dans les indicateurs globaux, mais le serveur n’en fournit pas encore le détail.`;
  });

  protected readonly errorSeries = computed<ChartPoint[]>(() =>
    (this.errors.data()?.errors ?? []).map((e) => ({
      label: e.reason,
      value: e.count,
      color: chartColors.error,
    })),
  );

  protected readonly scheduledSeries = computed<ChartPoint[]>(() => {
    const s = this.scheduled.data();
    if (!s) return [];
    const points: ChartPoint[] = [
      { label: 'Programmées', value: s.scheduled, color: SCHEDULED_COLORS.scheduled },
      { label: 'Publiées', value: s.published, color: SCHEDULED_COLORS.published },
      { label: 'Échouées', value: s.failed, color: SCHEDULED_COLORS.failed },
      { label: 'Annulées', value: s.cancelled, color: SCHEDULED_COLORS.cancelled },
    ];
    if (s.processing > 0) {
      points.splice(1, 0, {
        label: 'En cours',
        value: s.processing,
        color: SCHEDULED_COLORS.processing,
      });
    }
    return points;
  });
}
