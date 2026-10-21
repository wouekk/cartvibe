import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core";
import { NgIcon, provideIcons } from "@ng-icons/core";
import { ICON_DEFINITIONS, MATERIAL_TO_LUCIDE } from "./icon-map";

/**
 * A Lucide icon addressed by its Material name, because the API and the stored user data (shortcuts, group icons) name
 * Material icons. `<app-icon name="receipt_long" />` draws Lucide's receipt; an unknown name draws a plain circle and an
 * empty name keeps the space and draws nothing. Size follows the font size (1.125rem unless a class says otherwise).
 */
@Component({
  selector: "app-icon",
  standalone: true,
  imports: [NgIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons(ICON_DEFINITIONS)],
  host: { class: "inline-flex shrink-0 items-center justify-center align-middle", "aria-hidden": "true" },
  template: `
    @if (icon(); as icon) {
      <ng-icon [name]="icon" size="1em" />
    }
  `,
})
export class AppIconComponent {
  /** A Material icon name, e.g. "receipt_long". */
  public readonly name = input<string | null | undefined>("");

  protected readonly icon = computed(() => {
    const name = this.name();
    if (!name) {
      return "";
    }

    return MATERIAL_TO_LUCIDE[name] ?? "lucideCircle";
  });
}
