import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { DrawerComponent } from '@/shared/ui/drawer.component';
import { BadgeComponent } from '@/shared/ui/badge.component';
import { PreviewBadgeComponent } from '@shared/components/preview-badge.component';
import { FrontendPreviewNoticeComponent } from '@shared/components/frontend-preview-notice.component';
import { PlatformIconComponent } from '@shared/components/platform-icon.component';
import {
  LineChartComponent,
  type LinePoint,
  type LineSeries,
} from '@shared/components/charts/charts';
import { LucideAngularModule, ImageOff } from '@/shared/ui/icons';
import { formatDateTime } from '@shared/utils/format';
import {
  REZOUETTE_CAPABILITIES,
} from '@/core/config/feature-capabilities';
import {
  previewEngagementSeries,
  previewPostMetrics,
  previewReachSeries,
} from '@/core/config/frontend-preview-data';
import { platformLabel } from '@/features/dashboard/dashboard-labels';
import {
  POST_GROUP_STATUS_CONFIG,
  postTitle,
  type PostGroup,
} from './post-group';

/// Colonnes du tableau d'analytics, dans l'ordre de la maquette.
const METRIC_COLUMNS = [
  { key: 'likes', label: 'Likes' },
  { key: 'comments', label: 'Comments' },
  { key: 'shares', label: 'Shares' },
  { key: 'saves', label: 'Saves' },
  { key: 'clicks', label: 'Clicks' },
  { key: 'views', label: 'Views' },
  { key: 'follows', label: 'Follows' },
  { key: 'impressions', label: 'Impr.' },
  { key: 'reach', label: 'Reach' },
] as const;

/// Détail d'une publication.
///
/// ÉCRAN MIXTE, et c'est la difficulté : le contenu, le média et l'état par
/// plateforme sont RÉELS (historique backend), tandis que les métriques
/// sociales n'existent nulle part côté serveur. La section Analytics est donc
/// séparée, marquée « Aperçu » et précédée de sa propre notice — de sorte
/// qu'aucune ligne de ce panneau ne puisse être prise pour ce qu'elle n'est pas.
///
/// L'action « View » de la maquette est absente : `SocialPostResponseDto`
/// n'expose aucune URL publique. La reconstruire depuis `externalPostId` ou
/// `publishId` produirait des liens faux — la maquette perd un bouton, pas
/// l'utilisateur.
@Component({
  selector: 'app-post-details-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DrawerComponent,
    BadgeComponent,
    PreviewBadgeComponent,
    FrontendPreviewNoticeComponent,
    PlatformIconComponent,
    LineChartComponent,
    LucideAngularModule,
  ],
  templateUrl: './post-details-drawer.component.html',
})
export class PostDetailsDrawerComponent {
  readonly group = input<PostGroup | null>(null);
  readonly close = output<void>();

  protected readonly NoImageIcon = ImageOff;
  protected readonly formatDateTime = formatDateTime;
  protected readonly platformLabel = platformLabel;
  protected readonly metricColumns = METRIC_COLUMNS;
  protected readonly previewMetrics = previewPostMetrics;

  /// Raison, telle qu'auditée, pour laquelle les métriques sont un aperçu.
  protected readonly analyticsReason =
    REZOUETTE_CAPABILITIES.postEngagementAnalytics.reason ?? '';

  protected readonly open = computed(() => this.group() !== null);
  protected readonly title = computed(() => {
    const group = this.group();
    return group ? postTitle(group) : 'Post Details';
  });

  /// Sous-titre : l'état réel et sa date, jamais « Published » par défaut.
  protected readonly subtitle = computed(() => {
    const group = this.group();
    if (!group) return null;
    if (group.publishedAt) {
      return `Published ${formatDateTime(group.publishedAt)}`;
    }
    return `${POST_GROUP_STATUS_CONFIG[group.status].label} · ${formatDateTime(group.createdAt)}`;
  });

  protected readonly statusConfig = computed(() => {
    const group = this.group();
    return group ? POST_GROUP_STATUS_CONFIG[group.status] : null;
  });

  protected readonly engagementSeries: LineSeries[] = [
    { key: 'comments', label: 'Comments', color: '#2563eb' },
    { key: 'likes', label: 'Likes', color: '#d92d20' },
    { key: 'saves', label: 'Saves', color: '#dc8a00' },
    { key: 'shares', label: 'Shares', color: '#079455' },
  ];

  protected readonly reachSeries: LineSeries[] = [
    { key: 'impressions', label: 'Impressions', color: '#6938ef' },
    { key: 'reach', label: 'Reach', color: '#0e7490' },
    { key: 'views', label: 'Views', color: '#dc8a00' },
  ];

  protected readonly engagementPoints: LinePoint[] = previewEngagementSeries.map(
    (point) => ({ label: shortDate(point.date), values: point.values }),
  );

  protected readonly reachPoints: LinePoint[] = previewReachSeries.map(
    (point) => ({ label: shortDate(point.date), values: point.values }),
  );

  /// Valeur d'une métrique d'aperçu. `null` reste « — » : une métrique absente
  /// n'est pas un zéro mesuré.
  protected metricValue(
    row: (typeof previewPostMetrics)[number],
    key: string,
  ): string {
    const value = (row as unknown as Record<string, number | null>)[key];
    return value === null || value === undefined ? '—' : String(value);
  }
}

/// Libellé d'axe court (« Jul 10 ») construit sans `new Date` sur une chaîne
/// `YYYY-MM-DD`, qui serait interprétée en UTC et décalerait le jour.
function shortDate(date: string): string {
  const [, month, day] = date.split('-');
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const index = Number(month) - 1;
  return months[index] ? `${months[index]} ${Number(day)}` : date;
}
