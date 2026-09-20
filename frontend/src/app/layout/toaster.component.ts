import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LucideAngularModule, CheckCircle2, XCircle } from '@shared/ui/icons';
import { ToastService } from '@core/services/toast.service';

/// Conteneur global des toasts, monté une seule fois dans le shell applicatif
/// (thème clair, discret). Purement présentationnel : lit le signal du service.
@Component({
  selector: 'app-toaster',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  templateUrl: './toaster.component.html',
})
export class ToasterComponent {
  private readonly service = inject(ToastService);
  protected readonly toasts = this.service.toasts;
  protected readonly CheckIcon = CheckCircle2;
  protected readonly XIcon = XCircle;
}
