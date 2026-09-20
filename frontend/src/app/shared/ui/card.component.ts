import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { cn } from '@shared/utils/utils';

/// Surface de niveau 1 : carte BLANCHE posée sur le fond blanc de la page,
/// délimitée par une bordure fine et une ombre presque imperceptible — c'est le
/// repère visuel de la charte Rezouette. (`bg-card` désigne, lui, la surface
/// douce grise réservée aux bandeaux internes et aux survols.)
@Component({
  selector: 'app-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  host: { '[class]': 'classes()' },
})
export class CardComponent {
  readonly className = input('');
  protected readonly classes = computed(() =>
    cn('block rounded-xl border border-border bg-surface shadow-subtle', this.className()),
  );
}

@Component({
  selector: 'app-card-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  host: { '[class]': 'classes()' },
})
export class CardHeaderComponent {
  readonly className = input('');
  protected readonly classes = computed(() =>
    cn('flex flex-col gap-1 p-5 pb-0', this.className()),
  );
}

@Component({
  selector: 'app-card-title',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  host: { '[class]': 'classes()', role: 'heading', 'aria-level': '3' },
})
export class CardTitleComponent {
  readonly className = input('');
  protected readonly classes = computed(() =>
    cn('block text-base font-semibold text-foreground', this.className()),
  );
}

@Component({
  selector: 'app-card-description',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  host: { '[class]': 'classes()' },
})
export class CardDescriptionComponent {
  readonly className = input('');
  protected readonly classes = computed(() =>
    cn('block text-sm text-muted', this.className()),
  );
}

@Component({
  selector: 'app-card-content',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  host: { '[class]': 'classes()' },
})
export class CardContentComponent {
  readonly className = input('');
  protected readonly classes = computed(() => cn('block p-5', this.className()));
}
