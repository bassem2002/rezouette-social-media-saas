import { effect, type Signal } from '@angular/core';

/// Comportement partagé Dialog/Drawer (aucune duplication) : fermeture via
/// Échap + verrouillage du scroll du body tant que l'overlay est ouvert.
/// À appeler dans un contexte d'injection (constructeur de composant).
export function installOverlayBehavior(
  isOpen: Signal<boolean>,
  onClose: () => void,
): void {
  effect((onCleanup) => {
    if (!isOpen()) return;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    onCleanup(() => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    });
  });
}
