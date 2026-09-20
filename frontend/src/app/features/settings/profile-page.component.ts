import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { FrontendPreviewNoticeComponent } from '@shared/components/frontend-preview-notice.component';
import { PreviewBadgeComponent } from '@shared/components/preview-badge.component';
import { LabelComponent } from '@shared/components/label.component';
import { InputDirective } from '@shared/directives/input.directive';
import { ButtonComponent } from '@/shared/ui/button.component';
import { ToastService } from '@core/services/toast.service';
import { demoProfile } from '@/core/config/frontend-demo.config';
import { SETTINGS_PREVIEW_MESSAGES } from '@/core/config/frontend-preview-settings';
import { SettingsSectionComponent } from './settings-section.component';

/// Settings — Profile.
///
/// APERÇU FRONTEND : aucun endpoint utilisateur n'existe (pas de controller
/// `user`, aucun PATCH/PUT dans la couche présentation). Le formulaire est
/// réel et validé, mais « Save » n'enregistre rien et le dit.
@Component({
  selector: 'app-settings-profile-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    SettingsSectionComponent,
    FrontendPreviewNoticeComponent,
    PreviewBadgeComponent,
    LabelComponent,
    InputDirective,
    ButtonComponent,
  ],
  template: `
    <app-settings-section
      title="Profile"
      description="Your name, email address and password."
    >
      <app-frontend-preview-notice />

      <div class="mt-4 rounded-xl border border-border bg-surface p-5">
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="text-base font-semibold text-foreground">Profile</h2>
          <app-preview-badge />
        </div>
        <p class="mt-0.5 text-sm text-muted">Manage your account information</p>

        <div class="mt-5">
          <p class="mb-2 text-sm font-medium text-foreground">Avatar</p>
          <div class="flex flex-wrap items-center gap-3">
            <span
              class="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary-soft text-base font-semibold text-primary"
              aria-hidden="true"
            >
              {{ initials() }}
            </span>
            <app-button variant="secondary" size="sm" className="rounded-md" (click)="notifyAvatar()">
              Upload
            </app-button>
            <app-button variant="ghost" size="sm" className="rounded-md text-error" (click)="notifyAvatar()">
              Remove
            </app-button>
          </div>
          <p class="mt-2 text-xs text-muted">
            JPEG, PNG, WebP ou GIF. 5 Mo maximum — aucun fichier n’est envoyé.
          </p>
        </div>

        <form [formGroup]="form" (ngSubmit)="save()" class="mt-5 space-y-4">
          <div>
            <app-label htmlFor="profile-name" [required]="true">Name</app-label>
            <div class="flex flex-wrap items-start gap-2">
              <div class="min-w-0 flex-1">
                <input
                  id="profile-name"
                  appInput
                  formControlName="name"
                  [invalid]="form.controls.name.touched && form.controls.name.invalid"
                />
                @if (form.controls.name.touched && form.controls.name.invalid) {
                  <p class="mt-1.5 text-sm text-error" role="alert">
                    Indiquez un nom (80 caractères maximum).
                  </p>
                }
              </div>
              <app-button className="rounded-md" (click)="save()">Save</app-button>
            </div>
          </div>

          <div>
            <app-label htmlFor="profile-email">Email</app-label>
            <input id="profile-email" appInput type="email" formControlName="email" />
            <p class="mt-1.5 text-xs text-muted">
              La modification de l’adresse dépendra du service d’authentification,
              non encore connecté.
            </p>
          </div>
        </form>
      </div>
    </app-settings-section>
  `,
})
export class SettingsProfilePage {
  private readonly toast = inject(ToastService);

  /// Profil de démonstration partagé avec la sidebar — aucune identité inventée.
  protected readonly form = new FormGroup({
    name: new FormControl(demoProfile.name, {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(80)],
    }),
    email: new FormControl({ value: demoProfile.email, disabled: true }, {
      nonNullable: true,
    }),
  });

  protected readonly initials = computed(() =>
    demoProfile.name
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join(''),
  );

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.toast.info(SETTINGS_PREVIEW_MESSAGES.profileSaved);
  }

  protected notifyAvatar(): void {
    this.toast.info(SETTINGS_PREVIEW_MESSAGES.avatarUpload);
  }
}
