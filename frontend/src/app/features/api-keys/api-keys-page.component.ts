import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { PageHeaderComponent } from '@shared/components/page-header.component';
import { FrontendPreviewNoticeComponent } from '@shared/components/frontend-preview-notice.component';
import { FilterSelectComponent } from '@shared/components/filter-select.component';
import { SearchBarComponent } from '@shared/components/search-bar.component';
import { ConfirmDialogComponent } from '@shared/components/confirm-dialog.component';
import { LabelComponent } from '@shared/components/label.component';
import { InputDirective } from '@shared/directives/input.directive';
import { SelectDirective } from '@shared/directives/select.directive';
import { BadgeComponent } from '@/shared/ui/badge.component';
import { ButtonComponent } from '@/shared/ui/button.component';
import { DrawerComponent } from '@/shared/ui/drawer.component';
import { LucideAngularModule, ChevronDown, Plus, Trash2 } from '@/shared/ui/icons';
import { ToastService } from '@core/services/toast.service';
import {
  PREVIEW_BADGE,
  PREVIEW_MESSAGES,
  previewApiKeys,
  previewKeyPermissions,
  previewKeyScopes,
  previewKeyStatuses,
  type PreviewApiKey,
} from '@/core/config/frontend-preview.config';

/// Aperçu de la page « API Keys ».
///
/// ÉCRAN 100 % FRONTEND. La clé affichée est FICTIVE (préfixe `sk_preview_`,
/// suffixe `example`) : elle ne suit aucun format de clé réelle du projet et
/// n'est copiée d'aucun fichier d'environnement. Aucune clé n'est créée, ni
/// révélée, ni supprimée côté serveur.
@Component({
  selector: 'app-api-keys-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    PageHeaderComponent,
    FrontendPreviewNoticeComponent,
    FilterSelectComponent,
    SearchBarComponent,
    ConfirmDialogComponent,
    LabelComponent,
    InputDirective,
    SelectDirective,
    BadgeComponent,
    ButtonComponent,
    DrawerComponent,
    LucideAngularModule,
  ],
  templateUrl: './api-keys-page.component.html',
})
export class ApiKeysPage {
  private readonly toast = inject(ToastService);

  protected readonly PlusIcon = Plus;
  protected readonly TrashIcon = Trash2;
  protected readonly ChevronDownIcon = ChevronDown;

  protected readonly previewBadge = PREVIEW_BADGE;
  protected readonly createMessage = PREVIEW_MESSAGES.apiKeysCreate;
  protected readonly statuses = previewKeyStatuses;
  protected readonly permissions = previewKeyPermissions;
  protected readonly scopes = previewKeyScopes;

  protected readonly search = signal('');
  protected readonly status = signal('all');
  protected readonly permission = signal('all');

  protected readonly createOpen = signal(false);
  protected readonly pendingDelete = signal<PreviewApiKey | null>(null);

  /// État LOCAL au composant : une « suppression » ne retire la ligne que de
  /// cet affichage. Rien n'est persisté — ni en base, ni dans le navigateur —
  /// donc un rechargement de la page restaure la donnée de démonstration.
  private readonly keys = signal<readonly PreviewApiKey[]>(previewApiKeys);

  protected readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(60)],
    }),
    scope: new FormControl('all-profiles', { nonNullable: true }),
    permission: new FormControl<'Read & Write' | 'Read only'>('Read & Write', {
      nonNullable: true,
    }),
  });

  protected readonly rows = computed(() => {
    const term = this.search().trim().toLowerCase();
    const status = this.status();
    const permission = this.permission();

    return this.keys().filter((key) => {
      if (term && !key.name.toLowerCase().includes(term)) return false;
      if (status !== 'all' && key.status !== status) return false;
      if (permission !== 'all' && key.permission !== permission) return false;
      return true;
    });
  });

  protected readonly hasRows = computed(() => this.rows().length > 0);
  protected readonly isEmptied = computed(() => this.keys().length === 0);

  protected readonly deleteDescription = computed(() => {
    const key = this.pendingDelete();
    if (!key) return null;
    return `« ${key.name} » disparaîtra de cet affichage. ${PREVIEW_MESSAGES.apiKeysDelete}`;
  });

  protected openCreate(): void {
    this.form.reset({
      name: '',
      scope: 'all-profiles',
      permission: 'Read & Write',
    });
    this.createOpen.set(true);
  }

  /// « Création » simulée : aucune clé n'est générée ni affichée. Fabriquer une
  /// valeur ressemblant à un secret laisserait croire qu'elle est exploitable.
  protected submitCreate(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.createOpen.set(false);
    this.toast.info(PREVIEW_MESSAGES.apiKeysCreate);
  }

  protected confirmDelete(): void {
    const key = this.pendingDelete();
    if (!key) return;
    this.keys.update((keys) => keys.filter((k) => k.id !== key.id));
    this.pendingDelete.set(null);
    this.toast.info(PREVIEW_MESSAGES.apiKeysDelete);
  }

  protected restore(): void {
    this.keys.set(previewApiKeys);
  }

  protected resetFilters(): void {
    this.search.set('');
    this.status.set('all');
    this.permission.set('all');
  }
}
