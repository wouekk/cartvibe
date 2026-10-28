import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from "@angular/core";
import { Store } from "@ngxs/store";
import { FeatureConfigState } from "../../store/feature-config.state";
import { findShopBrand } from "./shop-logo-match";

/**
 * A 24px badge in front of a receipt's shop name: the shop's logo when it is a known brand and an admin has entered a
 * Logo.dev key (System Settings → Shop logos), otherwise its first letter. Logos load in the browser straight from
 * img.logo.dev, which Logo.dev's free plan requires (it does not allow storing them); nothing is bundled or kept on the
 * server. The logo sits on a white tile with a ring in the foreground color (black by day, white at night) so light
 * and dark logos both stay visible. The letter is white on black by day and black on white at night. If a logo fails
 * to load (Logo.dev has none, or the browser is offline), the letter shows.
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
    <img
      class="size-full object-contain p-px"
      data-testid="shop-logo"
      alt=""
      loading="lazy"
      referrerpolicy="no-referrer"
      [src]="src"
      (error)="markFailed()"
    />
  } @else {
    {{ initial() }}
  }`,
})
export class ShopMonogramComponent {
  public readonly name = input<string | null | undefined>("");

  private readonly logoKey = inject(Store).selectSignal(FeatureConfigState.shopLogoKey);

  /** The brand whose logo failed to load; keyed by slug so a reused component for another shop tries its own. */
  private readonly failedSlug = signal("");

  private readonly brand = computed(() => findShopBrand(this.name()));

  protected markFailed(): void {
    this.failedSlug.set(this.brand()?.slug ?? "");
  }

  protected readonly logoSrc = computed(() => {
    const brand = this.brand();
    const key = this.logoKey();
    return brand && key && brand.slug !== this.failedSlug() ? shopLogoUrl(brand.domain, key) : "";
  });

  protected readonly hostClass = computed(() =>
    this.logoSrc() ? "bg-white ring-1 ring-foreground" : "bg-foreground text-background"
  );

  protected readonly initial = computed(() => {
    const first = Array.from((this.name() ?? "").trim())[0];
    return first ? first.toLocaleUpperCase() : "?";
  });
}

/** Logo.dev's image URL: 64px covers the 24px badge on a 2x screen, and fallback=404 makes a missing logo an error. */
export function shopLogoUrl(domain: string, key: string): string {
  return `https://img.logo.dev/${encodeURIComponent(domain)}?token=${encodeURIComponent(key)}&size=64&format=png&fallback=404`;
}
