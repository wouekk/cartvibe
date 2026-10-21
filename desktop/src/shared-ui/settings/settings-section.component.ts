import { Component, computed, input } from "@angular/core";

/**
 * The settings card: a hairline surface with a title row, a body of flat `rw-section` rows and an optional footer
 * (status text left, actions right). Projected `[sectionActions]` sit in the header on the right.
 */
@Component({
  selector: "app-settings-section",
  standalone: false,
  host: { class: "block min-w-0" },
  template: `
    <section [class]="cardClass()" [attr.data-testid]="testId()">
      @if (title() || description()) {
        <div class="rw-card__head">
          <div class="min-w-0">
            @if (title()) {
              <h2 class="rw-card__title">{{ title() | t }}</h2>
            }
            @if (description()) {
              <p class="rw-card__desc">{{ description() | t }}</p>
            }
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <ng-content select="[sectionActions]"></ng-content>
          </div>
        </div>
      }
      <div class="rw-card__body">
        <ng-content></ng-content>
      </div>
      <ng-content select="[sectionFooter]"></ng-content>
    </section>
  `,
})
export class SettingsSectionComponent {
  public readonly title = input<string>("");
  public readonly description = input<string>("");
  public readonly tone = input<"default" | "destructive">("default");
  public readonly testId = input<string | null>(null);

  public readonly cardClass = computed(() => (this.tone() === "destructive" ? "rw-card rw-card--destructive" : "rw-card"));
}
