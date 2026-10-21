import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core";

/** A 24px badge with the shop's first letter, in front of a receipt's shop name. */
@Component({
  selector: "app-shop-monogram",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: "inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary",
    "aria-hidden": "true",
    "data-testid": "shop-monogram",
  },
  template: `{{ initial() }}`,
})
export class ShopMonogramComponent {
  public readonly name = input<string | null | undefined>("");

  protected readonly initial = computed(() => {
    const first = Array.from((this.name() ?? "").trim())[0];
    return first ? first.toLocaleUpperCase() : "?";
  });
}
