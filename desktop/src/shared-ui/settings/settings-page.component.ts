import { Component, computed, input } from "@angular/core";

/**
 * The shell every settings page shares: title, description, primary action top right, optional tab strip, content.
 * Every settings page fills the shared page width (--page-max) so a page never changes width between menus.
 */
@Component({
  selector: "app-settings-page",
  standalone: false,
  host: { class: "block", "[class]": "hostClass()" },
  template: `
    <div class="flex flex-col gap-6" data-testid="settings-page">
      <div class="flex min-w-0 flex-col gap-4">
        <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div class="min-w-0">
            <h1 class="text-2xl break-words">{{ title() | t }}</h1>
            @if (description()) {
              <p class="m-0 mt-1 max-w-2xl text-sm text-muted-foreground">{{ description() | t }}</p>
            }
            <ng-content select="[settingsDescription]"></ng-content>
          </div>
          <div class="flex flex-wrap items-center gap-2 [&_button]:min-h-9">
            <ng-content select="[settingsActions]"></ng-content>
          </div>
        </div>
        <ng-content select="[settingsTabs]"></ng-content>
      </div>
      <div class="flex min-w-0 flex-col gap-4">
        <ng-content></ng-content>
      </div>
    </div>
  `,
})
export class SettingsPageComponent {
  public readonly title = input<string>("");
  public readonly description = input<string>("");
  public readonly width = input<"narrow" | "wide">("wide");

  /** Both widths fill the shared page width (--page-max); `narrow` is kept so a call site can say a form is small. */
  public readonly hostClass = computed(() => (this.width() === "wide" ? "w-full" : "w-full"));
}
