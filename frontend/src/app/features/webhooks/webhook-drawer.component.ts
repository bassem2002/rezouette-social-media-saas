import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  signal,
} from '@angular/core';
import {
  FormArray,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { LabelComponent } from '@shared/components/label.component';
import { InputDirective } from '@shared/directives/input.directive';
import { ButtonComponent } from '@/shared/ui/button.component';
import { DrawerComponent } from '@/shared/ui/drawer.component';
import {
  LucideAngularModule,
  Eye,
  EyeOff,
  Plus,
  RotateCw,
  Trash2,
} from '@/shared/ui/icons';
import {
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_URL_PLACEHOLDER,
  previewWebhookEvents,
} from '@/core/config/frontend-preview.config';

/// Résultat d'une « création » de webhook : uniquement ce qui peut être affiché
/// sans risque. Le secret n'y figure PAS — il ne quitte jamais le formulaire.
export interface WebhookDraft {
  name: string;
  url: string;
  events: string[];
}

/// Panneau « New Webhook ».
///
/// Aucune requête n'est émise, ni vers le backend Rezouette, ni — surtout —
/// vers l'URL saisie : un panneau de configuration qui appellerait l'adresse
/// entrée transformerait l'interface en émetteur de requêtes arbitraires.
/// Le secret généré est une chaîne de démonstration, jamais conservée.
@Component({
  selector: 'app-webhook-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    DrawerComponent,
    LabelComponent,
    InputDirective,
    ButtonComponent,
    LucideAngularModule,
  ],
  templateUrl: './webhook-drawer.component.html',
})
export class WebhookDrawerComponent {
  readonly open = input(false);
  readonly close = output<void>();
  readonly submitted = output<WebhookDraft>();

  protected readonly PlusIcon = Plus;
  protected readonly TrashIcon = Trash2;
  protected readonly EyeIcon = Eye;
  protected readonly EyeOffIcon = EyeOff;
  protected readonly RotateIcon = RotateCw;

  protected readonly eventGroups = previewWebhookEvents;
  protected readonly signatureHeader = WEBHOOK_SIGNATURE_HEADER;
  protected readonly urlPlaceholder = WEBHOOK_URL_PLACEHOLDER;

  protected readonly secretVisible = signal(false);
  /// Vrai après une tentative d'envoi : évite d'afficher des erreurs sur un
  /// formulaire que l'utilisateur n'a pas encore soumis.
  protected readonly submitAttempted = signal(false);

  protected readonly form = new FormGroup({
    name: new FormControl('My Webhook', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(80)],
    }),
    url: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^https?:\/\/\S+$/)],
    }),
    secret: new FormControl('', { nonNullable: true }),
    headers: new FormArray<FormGroup<{
      key: FormControl<string>;
      value: FormControl<string>;
    }>>([]),
    events: new FormGroup(buildEventControls()),
  });

  protected get headers(): FormArray {
    return this.form.controls.headers;
  }

  /// MÉTHODE et non `computed` : la valeur dérive d'un FormGroup, qui n'est pas
  /// un signal. Un `computed` sans dépendance réactive serait figé après son
  /// premier calcul — le message d'erreur ne disparaîtrait jamais.
  protected selectedEventCount(): number {
    return this.collectEvents().length;
  }

  protected addHeader(): void {
    this.headers.push(
      new FormGroup({
        key: new FormControl('', { nonNullable: true }),
        value: new FormControl('', { nonNullable: true }),
      }),
    );
  }

  protected removeHeader(index: number): void {
    this.headers.removeAt(index);
  }

  /// Secret de DÉMONSTRATION, volontairement préfixé et généré sans API
  /// cryptographique : personne ne doit le confondre avec une valeur utilisable.
  protected generateSecret(): void {
    const suffix = Math.random().toString(36).slice(2, 12);
    this.form.controls.secret.setValue(`preview_secret_${suffix}`);
    this.secretVisible.set(true);
  }

  protected get hasEvent(): boolean {
    return this.collectEvents().length > 0;
  }

  protected submit(): void {
    this.submitAttempted.set(true);
    if (this.form.invalid || !this.hasEvent) {
      this.form.markAllAsTouched();
      return;
    }

    // Le secret et les en-têtes personnalisés restent dans le formulaire : la
    // page appelante n'en reçoit rien et n'a donc aucun moyen de les stocker.
    this.submitted.emit({
      name: this.form.controls.name.value.trim(),
      url: this.form.controls.url.value.trim(),
      events: this.collectEvents(),
    });
    this.reset();
  }

  protected cancel(): void {
    this.reset();
    this.close.emit();
  }

  /// Remet le panneau à son état initial — y compris le secret, qui n'est ainsi
  /// jamais conservé d'une ouverture à la suivante.
  private reset(): void {
    this.form.reset({
      name: 'My Webhook',
      url: '',
      secret: '',
    });
    this.headers.clear();
    this.form.controls.events.reset();
    this.secretVisible.set(false);
    this.submitAttempted.set(false);
  }

  private collectEvents(): string[] {
    const values = this.form.controls.events.value as Record<string, boolean>;
    return Object.entries(values)
      .filter(([, checked]) => checked)
      .map(([event]) => event);
  }
}

/// Un contrôle booléen par événement du catalogue — construit à partir de la
/// liste centralisée, jamais recopié à la main dans le gabarit.
function buildEventControls(): Record<string, FormControl<boolean>> {
  const controls: Record<string, FormControl<boolean>> = {};
  for (const group of previewWebhookEvents) {
    for (const event of group.events) {
      controls[event] = new FormControl(false, { nonNullable: true });
    }
  }
  return controls;
}
