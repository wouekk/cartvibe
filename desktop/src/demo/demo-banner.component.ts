import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { HlmButton } from "@spartan-ng/helm/button";
import { TranslatePipe } from "../i18n/translate.pipe";
import { DemoSession } from "./demo-session";

/** The slim strip above the header that says this is a demo and offers a Reset. */
@Component({
  selector: "app-demo-banner",
  host: { class: "block" },
  imports: [HlmButton, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="flex min-h-9 items-center justify-between gap-2 border-b border-border bg-muted px-3 py-1 text-xs text-muted-foreground sm:px-6"
      role="status"
      data-testid="demo-banner"
    >
      <span class="min-w-0 truncate font-medium text-foreground">{{ 'Demo, nothing is saved' | t }}</span>
      <span class="flex shrink-0 items-center gap-1">
        <a hlmBtn variant="ghost" size="sm" class="max-sm:hidden" href="../" data-testid="demo-home">{{ 'Back to the project page' | t }}</a>
        <button hlmBtn variant="outline" size="sm" type="button" data-testid="demo-reset" (click)="session.reset()">
          {{ 'Reset' | t }}
        </button>
      </span>
    </div>
  `,
})
export class DemoBannerComponent {
  protected readonly session = inject(DemoSession);
}
