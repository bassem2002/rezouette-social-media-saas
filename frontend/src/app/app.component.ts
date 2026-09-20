import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToasterComponent } from '@layout/toaster.component';

/// Racine de l'application : sortie du routeur + conteneur global des toasts.
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, ToasterComponent],
  template: `
    <router-outlet />
    <app-toaster />
  `,
})
export class AppComponent {}
