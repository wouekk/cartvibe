import { inject, Injectable, signal } from "@angular/core";
import { asBarcode } from "./barcode";
import { OpenFoodFactsService } from "./open-food-facts.service";
import { CheckedProduct } from "./product-check.models";
import { RecentProductsService } from "./recent-products.service";

export type ProductCheckStatus = "idle" | "loading" | "product" | "results" | "notFound" | "error";

/**
 * What the product checker is showing. The header input and the scanner feed it; the drawer reads it. A request that is
 * answered after a newer one was started is ignored, so a slow search can never replace a barcode the person scanned since.
 */
@Injectable({ providedIn: "root" })
export class ProductCheckService {
  private readonly openFoodFacts = inject(OpenFoodFactsService);
  private readonly recent = inject(RecentProductsService);

  private latestRequest = 0;

  public readonly status = signal<ProductCheckStatus>("idle");
  public readonly query = signal("");
  public readonly product = signal<CheckedProduct | null>(null);
  public readonly results = signal<CheckedProduct[]>([]);

  public readonly recentProducts = this.recent.products;

  /** Checks what was typed or scanned: a barcode is looked up, anything else is searched for. */
  public check(input: string): void {
    const text = input.trim();
    if (!text) {
      return;
    }

    const request = ++this.latestRequest;
    this.query.set(text);
    this.status.set("loading");

    const barcode = asBarcode(text);
    if (barcode) {
      this.openFoodFacts.getByBarcode(barcode).subscribe({
        next: (product) => this.ifCurrent(request, () => (product ? this.showProduct(product) : this.status.set("notFound"))),
        error: () => this.ifCurrent(request, () => this.status.set("error")),
      });

      return;
    }

    this.openFoodFacts.search(text).subscribe({
      next: (products) =>
        this.ifCurrent(request, () => {
          this.results.set(products);
          this.status.set(products.length ? "results" : "notFound");
        }),
      error: () => this.ifCurrent(request, () => this.status.set("error")),
    });
  }

  /** Shows a product (picked from the results, the recent scans or a lookup) and remembers it. */
  public showProduct(product: CheckedProduct): void {
    this.latestRequest++;
    this.product.set(product);
    this.status.set("product");
    this.recent.add(product);
  }

  /** Back from a product to the search results it was picked from. */
  public backToResults(): void {
    this.status.set(this.results().length ? "results" : "idle");
  }

  private ifCurrent(request: number, action: () => void): void {
    if (request === this.latestRequest) {
      action();
    }
  }
}
