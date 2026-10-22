import { ChangeDetectionStrategy, Component, input } from "@angular/core";

/**
 * The card every report-builder config section shares: a hairline `cv-card` with a
 * quiet icon tile, a title and one-line description, an optional actions slot
 * ([sectionActions], for the section's compact add button), and the projected
 * body. Token colours only, so it reads right in both themes.
 */
@Component({
  selector: "app-report-section",
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "block" },
  template: `
    <section class="cv-card">
      <header class="flex items-start gap-3 px-5 pb-3 pt-4">
        <span
          class="inline-flex size-8 flex-none items-center justify-center rounded-md bg-muted text-muted-foreground [&_app-icon]:size-4"
          aria-hidden="true"
        >
          <app-icon [name]="icon()"></app-icon>
        </span>
        <div class="min-w-0 flex-1">
          <h3 class="m-0 text-sm font-semibold leading-tight text-foreground">{{ headerText() }}</h3>
          @if (subtitle()) {
            <p class="m-0 mt-0.5 text-xs text-muted-foreground">{{ subtitle() }}</p>
          }
        </div>
        <div class="flex flex-none items-center gap-1">
          <ng-content select="[sectionActions]"></ng-content>
        </div>
      </header>
      <div class="flex flex-col gap-3 px-5 pb-5">
        <ng-content></ng-content>
      </div>
    </section>
  `,
})
export class ReportSectionComponent {
  public readonly icon = input<string>("");
  public readonly headerText = input<string>("");
  public readonly subtitle = input<string>("");
}
