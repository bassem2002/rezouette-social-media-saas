import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { PageHeaderComponent } from '@shared/components/page-header.component';
import { FrontendPreviewNoticeComponent } from '@shared/components/frontend-preview-notice.component';
import { PreviewBadgeComponent } from '@shared/components/preview-badge.component';
import { FilterSelectComponent } from '@shared/components/filter-select.component';
import { SearchBarComponent } from '@shared/components/search-bar.component';
import { LabelComponent } from '@shared/components/label.component';
import { InputDirective } from '@shared/directives/input.directive';
import { SelectDirective } from '@shared/directives/select.directive';
import { ButtonComponent } from '@/shared/ui/button.component';
import { DrawerComponent } from '@/shared/ui/drawer.component';
import { ChevronDown, LucideAngularModule, Plus, Workflow } from '@/shared/ui/icons';
import { ToastService } from '@core/services/toast.service';
import {
  INBOX_PREVIEW_MESSAGES,
  previewStatusFilters,
  previewTriggerFilters,
  previewWorkflows,
} from '@/core/config/frontend-preview-data';

/// Inbox — Workflows.
///
/// APERÇU FRONTEND intégral : aucun endpoint d'automatisation n'existe.
/// Le formulaire décrit un déclencheur et une action, mais rien n'est
/// enregistré ni exécuté — aucune réponse automatique ne partira.
@Component({
  selector: 'app-inbox-workflows-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    PageHeaderComponent,
    FrontendPreviewNoticeComponent,
    PreviewBadgeComponent,
    FilterSelectComponent,
    SearchBarComponent,
    LabelComponent,
    InputDirective,
    SelectDirective,
    ButtonComponent,
    DrawerComponent,
    LucideAngularModule,
  ],
  templateUrl: './workflows-page.component.html',
})
export class InboxWorkflowsPage {
  private readonly toast = inject(ToastService);

  protected readonly PlusIcon = Plus;
  protected readonly WorkflowIcon = Workflow;
  protected readonly ChevronDownIcon = ChevronDown;

  protected readonly statusOptions = previewStatusFilters;
  protected readonly triggerOptions = previewTriggerFilters;

  protected readonly search = signal('');
  protected readonly status = signal('all');
  protected readonly trigger = signal('all');
  protected readonly drawerOpen = signal(false);
  protected readonly submitAttempted = signal(false);

  protected readonly workflows = signal(previewWorkflows);
  protected readonly hasWorkflows = computed(() => this.workflows().length > 0);

  protected readonly triggers = [
    'Nouveau message reçu',
    'Nouveau commentaire',
    'Publication échouée',
    'Compte à reconnecter',
  ];
  protected readonly actions = [
    'Envoyer une réponse',
    'Ajouter une étiquette',
    'Notifier l’équipe',
  ];

  protected readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(80)],
    }),
    trigger: new FormControl('Nouveau message reçu', { nonNullable: true }),
    action: new FormControl('Envoyer une réponse', { nonNullable: true }),
  });

  protected open(): void {
    this.submitAttempted.set(false);
    this.form.reset({
      name: '',
      trigger: 'Nouveau message reçu',
      action: 'Envoyer une réponse',
    });
    this.drawerOpen.set(true);
  }

  protected submit(): void {
    this.submitAttempted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.drawerOpen.set(false);
    this.toast.info(INBOX_PREVIEW_MESSAGES.workflow);
  }
}
