import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PageHeaderComponent } from '@shared/components/page-header.component';
import { PostComposerComponent } from './post-composer.component';

/// Page de composition et publication multi-réseaux.
@Component({
  selector: 'app-publication-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, PostComposerComponent],
  template: `
    <div class="space-y-6">
      <app-page-header
        title="Publication"
        description="Composez un post et diffusez-le sur Facebook, Instagram et TikTok."
      />
      <app-post-composer />
    </div>
  `,
})
export class PublicationPage {}
