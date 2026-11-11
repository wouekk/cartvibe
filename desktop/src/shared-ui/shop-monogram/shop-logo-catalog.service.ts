import { computed, effect, inject, Injectable, Injector, signal } from "@angular/core";
import { catchError, of, take } from "rxjs";
import { ShopLogoService } from "../../open-api";
import { AuthStore } from "../../store/auth.store";
import { FeatureConfigStore } from "../../store/feature-config.store";
import { buildCandidates, Candidate, ShopBrand } from "./shop-logo-match";

/**
 * The shop logos the server downloaded from Logo.dev (System Settings → Shop Logos), loaded once per sign-in while the
 * household has a key. The monograms match a receipt's shop name against them; an empty list shows letters.
 */
@Injectable({ providedIn: "root" })
export class ShopLogoCatalog {
  private readonly authStore = inject(AuthStore);

  private readonly featureConfigStore = inject(FeatureConfigStore);

  /** The API client is resolved only when logos are on, so a page (or spec) with logos off needs no HTTP. */
  private readonly injector = inject(Injector);

  private readonly enabled = this.featureConfigStore.shopLogosEnabled;

  private readonly signedIn = this.authStore.isLoggedIn;

  private readonly logos = signal<ShopBrand[]>([]);

  /** The spellings to match, longest first; none while logos are off or not loaded. */
  public readonly candidates = computed<Candidate[]>(() => buildCandidates(this.logos()));

  constructor() {
    effect(() => {
      if (this.enabled() && this.signedIn()) {
        this.load();
      } else {
        this.logos.set([]);
      }
    });
  }

  /** The address of a downloaded logo; the browser sends the session cookie and keeps it for a day. */
  public logoUrl(slug: string): string {
    return `/api/shopLogo/${encodeURIComponent(slug)}`;
  }

  private load(): void {
    this.injector
      .get(ShopLogoService)
      .getShopLogos()
      .pipe(
        take(1),
        catchError(() => of([]))
      )
      .subscribe((logos) => this.logos.set(logos ?? []));
  }
}
