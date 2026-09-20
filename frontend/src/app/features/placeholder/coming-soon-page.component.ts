import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PageHeaderComponent } from '@shared/components/page-header.component';
import { CardComponent } from '@/shared/ui/card.component';
import { LucideAngularModule, Zap } from '@/shared/ui/icons';
import { COMING_SOON_MESSAGE } from '@/core/config/frontend-demo.config';

/// Page d'attente partagée par les entrées de menu qui n'ont pas encore
/// d'équivalent côté serveur (Inbox, Ads, Numbers, SMS, API Keys, Users,
/// Webhooks, Logs, Documentation).
///
/// Elle n'émet AUCUNE requête et n'enregistre RIEN : afficher une donnée
/// plausible ici reviendrait à mentir sur l'état réel de la fonctionnalité.
/// Le titre vient de la définition de route (`data.title`).
@Component({
  selector: 'app-coming-soon-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, CardComponent, RouterLink, LucideAngularModule],
  template: `
    <div class="space-y-6">
      <app-page-header [title]="title()" [description]="description()" />

      <app-card
        className="flex flex-col items-center justify-center gap-3 p-12 text-center"
      >
        <span
          class="flex size-11 items-center justify-center rounded-full bg-primary-soft text-primary"
        >
          <lucide-icon [img]="ZapIcon" class="size-5" aria-hidden="true" />
        </span>
        <p class="text-base font-semibold text-foreground">{{ message }}</p>
        <p class="max-w-md text-sm text-muted">
          Cet écran fait partie de la refonte de l’interface. Il sera activé
          lorsque le service correspondant sera disponible côté serveur.
        </p>
        <a
          routerLink="/dashboard"
          class="mt-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Revenir au Dashboard
        </a>
      </app-card>
    </div>
  `,
})
export class ComingSoonPage {
  private readonly route = inject(ActivatedRoute);

  protected readonly ZapIcon = Zap;
  protected readonly message = COMING_SOON_MESSAGE;

  private readonly data = toSignal(this.route.data, {
    initialValue: this.route.snapshot.data,
  });

  protected readonly title = computed(
    () => (this.data()['title'] as string | undefined) ?? 'Bientôt disponible',
  );
  protected readonly description = computed(
    () => (this.data()['description'] as string | undefined) ?? null,
  );
}
