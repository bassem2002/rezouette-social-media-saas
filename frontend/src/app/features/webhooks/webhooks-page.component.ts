import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { PageHeaderComponent } from '@shared/components/page-header.component';
import { FrontendPreviewNoticeComponent } from '@shared/components/frontend-preview-notice.component';
import { BadgeComponent } from '@/shared/ui/badge.component';
import { ButtonComponent } from '@/shared/ui/button.component';
import { LucideAngularModule, Plus, Trash2, Webhook } from '@/shared/ui/icons';
import { ToastService } from '@core/services/toast.service';
import {
  PREVIEW_BADGE,
  PREVIEW_MESSAGES,
  previewWebhooks,
  type PreviewWebhook,
} from '@/core/config/frontend-preview.config';
import {
  WebhookDrawerComponent,
  type WebhookDraft,
} from './webhook-drawer.component';

/// Aperçu de la page « Webhooks ».
///
/// ÉCRAN 100 % FRONTEND. Les webhooks « créés » ne vivent que dans l'état de ce
/// composant : rien n'est enregistré, aucun événement n'est émis, et l'URL
/// saisie n'est jamais appelée. Le secret n'est même pas remonté par le panneau.
@Component({
  selector: 'app-webhooks-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PageHeaderComponent,
    FrontendPreviewNoticeComponent,
    BadgeComponent,
    ButtonComponent,
    WebhookDrawerComponent,
    LucideAngularModule,
  ],
  templateUrl: './webhooks-page.component.html',
})
export class WebhooksPage {
  private readonly toast = inject(ToastService);

  protected readonly PlusIcon = Plus;
  protected readonly TrashIcon = Trash2;
  protected readonly WebhookIcon = Webhook;

  protected readonly previewBadge = PREVIEW_BADGE;

  protected readonly drawerOpen = signal(false);
  /// Liste de session : repart vide à chaque chargement de la page.
  protected readonly webhooks = signal<readonly PreviewWebhook[]>(previewWebhooks);

  protected readonly hasWebhooks = computed(() => this.webhooks().length > 0);

  protected onSubmitted(draft: WebhookDraft): void {
    this.webhooks.update((current) => [
      ...current,
      {
        id: `preview-webhook-${current.length + 1}`,
        name: draft.name,
        url: draft.url,
        events: draft.events,
      },
    ]);
    this.drawerOpen.set(false);
    this.toast.info(
      'Webhook simulé. Cette fonctionnalité sera enregistrée lorsque le backend Webhooks sera disponible.',
    );
  }

  protected remove(id: string): void {
    this.webhooks.update((current) => current.filter((w) => w.id !== id));
    this.toast.info(PREVIEW_MESSAGES.webhooks);
  }
}
