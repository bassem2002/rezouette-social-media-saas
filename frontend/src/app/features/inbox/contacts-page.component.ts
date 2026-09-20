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
import { DialogComponent } from '@/shared/ui/dialog.component';
import {
  ChevronDown,
  LucideAngularModule,
  Plus,
  Upload,
  Users,
} from '@/shared/ui/icons';
import { ToastService } from '@core/services/toast.service';
import {
  INBOX_PREVIEW_MESSAGES,
  previewContacts,
  previewPlatformFilters,
} from '@/core/config/frontend-preview-data';

/// Inbox — Contacts.
///
/// APERÇU FRONTEND intégral : aucun endpoint de contacts n'existe. Un contact
/// « ajouté » n'est ni envoyé, ni enregistré — il ne survit même pas au
/// rechargement de la page, ce que l'écran annonce explicitement.
@Component({
  selector: 'app-inbox-contacts-page',
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
    DialogComponent,
    LucideAngularModule,
  ],
  templateUrl: './contacts-page.component.html',
})
export class InboxContactsPage {
  private readonly toast = inject(ToastService);

  protected readonly PlusIcon = Plus;
  protected readonly UploadIcon = Upload;
  protected readonly ContactsIcon = Users;
  protected readonly ChevronDownIcon = ChevronDown;

  protected readonly platformOptions = previewPlatformFilters;

  protected readonly search = signal('');
  protected readonly platform = signal('all');
  protected readonly addOpen = signal(false);
  protected readonly importOpen = signal(false);
  protected readonly submitAttempted = signal(false);

  protected readonly contacts = signal(previewContacts);

  protected readonly rows = computed(() => {
    const term = this.search().trim().toLowerCase();
    return this.contacts().filter(
      (contact) => !term || contact.name.toLowerCase().includes(term),
    );
  });

  protected readonly hasContacts = computed(() => this.rows().length > 0);

  protected readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(80)],
    }),
    identifier: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(120)],
    }),
    platform: new FormControl('FACEBOOK', { nonNullable: true }),
  });

  protected openAdd(): void {
    this.submitAttempted.set(false);
    this.form.reset({ name: '', identifier: '', platform: 'FACEBOOK' });
    this.addOpen.set(true);
  }

  protected submitAdd(): void {
    this.submitAttempted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.addOpen.set(false);
    this.toast.info(INBOX_PREVIEW_MESSAGES.contactAdded);
  }

  protected notifyImport(): void {
    this.importOpen.set(false);
    this.toast.info(INBOX_PREVIEW_MESSAGES.contactImport);
  }
}
