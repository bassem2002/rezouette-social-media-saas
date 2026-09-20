import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { DrawerComponent } from '@/shared/ui/drawer.component';
import { ButtonComponent } from '@/shared/ui/button.component';
import { PostComposerComponent } from '@/features/publication/post-composer.component';
import { ToastService } from '@core/services/toast.service';

/// Panneau « Create Post ».
///
/// Il n'apporte QUE l'habillage : en-tête, largeur, pied de panneau. Le
/// formulaire à l'intérieur est le composer de publication existant, importé
/// tel quel — sélection des plateformes, compteurs, upload d'image et de
/// vidéo, options YouTube, publication immédiate ou programmée, gestion des
/// échecs partiels. Rien de cette logique n'est réécrit ici : la dupliquer pour
/// obtenir la même apparence aurait créé deux chemins de publication à
/// maintenir, et c'est exactement ainsi qu'une régression s'installe.
///
/// La page `/publication` continue d'exister et d'utiliser le même composer :
/// les deux entrées mènent au même code.
@Component({
  selector: 'app-create-post-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DrawerComponent, ButtonComponent, PostComposerComponent],
  template: `
    <app-drawer
      [open]="open()"
      panelId="create-post-drawer"
      title="Create Post"
      description="create & publish content"
      maxWidthClass="max-w-[min(1120px,80vw)]"
      className="max-lg:!max-w-full"
      (close)="close.emit()"
    >
      <!-- « Reuse » : reprendre une publication passée suppose un endpoint de
           duplication, qui n'existe pas. Le bouton l'annonce plutôt que de
           rester inerte. -->
      <app-button
        drawerHeaderAction
        variant="danger"
        size="sm"
        className="rounded-md"
        (click)="notifyReuse()"
      >
        Reuse
      </app-button>

      @if (open()) {
        <!-- Monté seulement à l'ouverture : le composer repart ainsi d'un
             formulaire vierge à chaque nouvelle publication. -->
        <app-post-composer />
      }

      <div drawerFooter class="contents">
        <app-button variant="secondary" (click)="close.emit()">cancel</app-button>
      </div>
    </app-drawer>
  `,
})
export class CreatePostDrawerComponent {
  private readonly toast = inject(ToastService);

  readonly open = input(false);
  readonly close = output<void>();

  protected notifyReuse(): void {
    this.toast.info(
      'La reprise d’une publication existante sera disponible lorsque le backend exposera la duplication.',
    );
  }
}
