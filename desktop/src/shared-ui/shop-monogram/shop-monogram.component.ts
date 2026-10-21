import { ChangeDetectionStrategy, Component, computed, input, signal } from "@angular/core";
import { findShopLogo } from "./shop-logo-match";

/**
 * A 24px badge in front of a receipt's shop name: the shop's logo when it is a known one (static files in
 * `assets/shops`, see `scripts/shop-logos`), otherwise its first letter. The logo sits on a white tile with a ring
 * in the foreground color (black on the White theme, white on Black) so light and dark logos both stay visible. The
 * letter is white on black on the White theme and black on white on Black. If a logo file fails to load, the letter shows.
 */
@Component({
  selector: "app-shop-monogram",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      "inline-flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-md text-xs font-semibold",
    "[class]": "hostClass()",
    "aria-hidden": "true",
    "data-testid": "shop-monogram",
  },
  template: `@if (logoSrc(); as src) {
    <img class="size-full object-contain p-px" data-testid="shop-logo" alt="" [src]="src" (error)="markFailed()" />
  } @else {
    {{ initial() }}
  }`,
})
export class ShopMonogramComponent {
  public readonly name = input<string | null | undefined>("");

  /** The logo whose file failed to load; keyed by slug so a reused component for another shop tries its own file. */
  private readonly failedSlug = signal("");

  private readonly logo = computed(() => findShopLogo(this.name()));

  protected markFailed(): void {
    this.failedSlug.set(this.logo()?.slug ?? "");
  }

  protected readonly logoSrc = computed(() => {
    const logo = this.logo();
    return logo && logo.slug !== this.failedSlug() ? `assets/shops/${logo.slug}.png` : "";
  });

  protected readonly hostClass = computed(() =>
    this.logoSrc() ? "bg-white ring-1 ring-foreground" : "bg-foreground text-background"
  );

  protected readonly initial = computed(() => {
    const first = Array.from((this.name() ?? "").trim())[0];
    return first ? first.toLocaleUpperCase() : "?";
  });
}
