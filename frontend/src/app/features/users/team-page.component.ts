import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { PageHeaderComponent } from '@shared/components/page-header.component';
import { FrontendPreviewNoticeComponent } from '@shared/components/frontend-preview-notice.component';
import { FilterSelectComponent } from '@shared/components/filter-select.component';
import { SearchBarComponent } from '@shared/components/search-bar.component';
import { LabelComponent } from '@shared/components/label.component';
import { InputDirective } from '@shared/directives/input.directive';
import { SelectDirective } from '@shared/directives/select.directive';
import { BadgeComponent } from '@/shared/ui/badge.component';
import { ButtonComponent } from '@/shared/ui/button.component';
import { DrawerComponent } from '@/shared/ui/drawer.component';
import { DialogComponent } from '@/shared/ui/dialog.component';
import { LucideAngularModule, ChevronDown, UserPlus } from '@/shared/ui/icons';
import { ToastService } from '@core/services/toast.service';
import {
  PREVIEW_BADGE,
  PREVIEW_MESSAGES,
  previewAccessLevels,
  previewInviteAccess,
  previewInviteRoles,
  previewMembers,
  previewRoles,
} from '@/core/config/frontend-preview.config';

/// Aperçu de la page « Team ».
///
/// ÉCRAN 100 % FRONTEND. Le seul membre listé est le propriétaire LOCAL de
/// l'interface, repris du profil de démonstration déjà utilisé par la sidebar :
/// aucun autre utilisateur n'est fabriqué et aucune invitation n'est envoyée.
@Component({
  selector: 'app-team-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    PageHeaderComponent,
    FrontendPreviewNoticeComponent,
    FilterSelectComponent,
    SearchBarComponent,
    LabelComponent,
    InputDirective,
    SelectDirective,
    BadgeComponent,
    ButtonComponent,
    DrawerComponent,
    DialogComponent,
    LucideAngularModule,
  ],
  templateUrl: './team-page.component.html',
})
export class TeamPage {
  private readonly toast = inject(ToastService);

  protected readonly UserPlusIcon = UserPlus;
  protected readonly ChevronDownIcon = ChevronDown;

  protected readonly previewBadge = PREVIEW_BADGE;
  protected readonly inviteMessage = PREVIEW_MESSAGES.usersInvite;
  protected readonly activityMessage = PREVIEW_MESSAGES.usersActivity;
  protected readonly roles = previewRoles;
  protected readonly accessLevels = previewAccessLevels;
  protected readonly inviteRoles = previewInviteRoles;
  protected readonly inviteAccess = previewInviteAccess;

  protected readonly search = signal('');
  protected readonly role = signal('all');
  protected readonly access = signal('all');

  protected readonly inviteOpen = signal(false);
  protected readonly activityOpen = signal(false);

  protected readonly form = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    role: new FormControl<'Admin' | 'Member'>('Member', { nonNullable: true }),
    access: new FormControl<'Full access' | 'Limited access'>('Limited access', {
      nonNullable: true,
    }),
  });

  protected readonly members = computed(() => {
    const term = this.search().trim().toLowerCase();
    const role = this.role();
    const access = this.access();

    return previewMembers.filter((member) => {
      if (
        term &&
        !member.name.toLowerCase().includes(term) &&
        !member.email.toLowerCase().includes(term)
      ) {
        return false;
      }
      if (role !== 'all' && member.role !== role) return false;
      if (access !== 'all' && member.access !== access) return false;
      return true;
    });
  });

  protected readonly hasMembers = computed(() => this.members().length > 0);

  /// Sous-titre : le décompte réel de la liste de démonstration, jamais un
  /// nombre figé qui contredirait le tableau.
  protected readonly memberCount = computed(() => {
    const count = previewMembers.length;
    return count === 1 ? '1 member' : `${count} members`;
  });

  protected openInvite(): void {
    this.form.reset({ email: '', role: 'Member', access: 'Limited access' });
    this.inviteOpen.set(true);
  }

  /// Invitation simulée : le formulaire est validé localement, puis l'écran
  /// annonce explicitement qu'aucun email n'est parti.
  protected submitInvite(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.inviteOpen.set(false);
    this.toast.info(PREVIEW_MESSAGES.usersInvite);
  }

  protected resetFilters(): void {
    this.search.set('');
    this.role.set('all');
    this.access.set('all');
  }

  /// Initiales d'affichage — dérivées du nom réel, jamais d'un nom inventé.
  protected initialsOf(name: string): string {
    return (
      name
        .split(/[\s@._-]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('') || '?'
    );
  }
}
