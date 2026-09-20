import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { DrawerComponent } from '@/shared/ui/drawer.component';
import { BadgeComponent } from '@/shared/ui/badge.component';
import { StatusBadgeComponent, PlatformBadgeComponent } from '@shared/components/badges';
import { LucideAngularModule, ExternalLink } from '@/shared/ui/icons';
import { formatDateTime } from '@shared/utils/format';
import { youtubeErrorLabel } from '@core/models';
import type { SocialPost } from '@core/models';

/// Détail d'une publication dans un Drawer simple (pas de modal complexe).
@Component({
  selector: 'app-post-details-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DrawerComponent,
    BadgeComponent,
    StatusBadgeComponent,
    PlatformBadgeComponent,
    LucideAngularModule,
  ],
  templateUrl: './post-details-drawer.component.html',
})
export class PostDetailsDrawerComponent {
  readonly post = input<SocialPost | null>(null);
  readonly close = output<void>();
  protected readonly formatDateTime = formatDateTime;
  protected readonly ExternalLinkIcon = ExternalLink;
  /// Traduit une raison d'échec YouTube en message lisible (fallback compris).
  protected readonly youtubeErrorLabel = youtubeErrorLabel;
}
