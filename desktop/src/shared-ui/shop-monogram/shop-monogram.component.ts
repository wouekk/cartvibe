import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from "@angular/core";
import { ShopLogoCatalog } from "./shop-logo-catalog.service";
import { findShopBrand } from "./shop-logo-match";

/**
 * A 24px badge in front of a receipt's shop name: the shop's logo when the server has downloaded one (an admin entered
 * a Logo.dev key under System Settings → Shop Logos), otherwise its first letter. Logos come from this server, never
 * straight from Logo.dev. The logo sits on a white tile with a ring in the foreground color (black by day, white at
 * night) so light and dark logos both stay visible. The letter is white on black by day and black on white at night. If
 * a logo fails to load, the letter shows.
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
    <img class="size-full object-contain p-px" data-testid="shop-logo" alt="" loading="lazy" [src]="src" (error)="markFailed()" />
  } @else {
    {{ initial() }}
  }`,
})
export class ShopMonogramComponent {
  public readonly name = input<string | null | undefined>("");

  private readonly catalog = inject(ShopLogoCatalog);

  /** The brand whose logo failed to load; keyed by slug so a reused component for another shop tries its own. */
  private readonly failedSlug = signal("");

  private readonly brand = computed(() => findShopBrand(this.name(), this.catalog.candidates()));

  protected markFailed(): void {
    this.failedSlug.set(this.brand()?.slug ?? "");
  }

  protected readonly logoSrc = computed(() => {
    const brand = this.brand();
    return brand && brand.slug !== this.failedSlug() ? this.catalog.logoUrl(brand.slug) : "";
  });

  protected readonly hostClass = computed(() =>
    this.logoSrc() ? "bg-white ring-1 ring-foreground" : "bg-foreground text-background"
  );

  protected readonly initial = computed(() => {
    const first = Array.from((this.name() ?? "").trim())[0];
    return first ? first.toLocaleUpperCase() : "?";
  });
}
