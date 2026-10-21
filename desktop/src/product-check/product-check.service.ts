import { inject, Injectable, signal } from "@angular/core";
import { asBarcode } from "./barcode";
import { OpenFoodFactsService } from "./open-food-facts.service";
import { CheckedProduct } from "./product-check.models";
import { RecentProductsService } from "./recent-products.service";

export type ProductCheckStatus = "idle" | "loading" | "product" | "notFound" | "needsBarcode" | "error";

/**
 * What the product checker is showing. The header input and the scanner feed it; the drawer reads it. A request that is
 * answered after a newer one was started is ignored, so a slow lookup can never replace a product picked since.
 *
 * Only barcodes can be checked: Open Food Facts refuses name searches from a browser (see `OpenFoodFactsService`), so
 * anything else is answered with `needsBarcode` and no request is made.
 */
@Injectable({ providedIn: "root" })
export class ProductCheckService {
  private readonly openFoodFacts = inject(OpenFoodFactsService);
  private readonly recent = inject(RecentProductsService);

  private latestRequest = 0;

  public readonly status = signal<ProductCheckStatus>("idle");
  public readonly query = signal("");
  public readonly product = signal<CheckedProduct | null>(null);

  public readonly recentProducts = this.recent.products;

  /** Checks what was typed or scanned: a valid barcode is looked up, anything else is turned down. */
  public check(input: string): void {
    const text = input.trim();
    if (!text) {
      return;
    }

    const request = ++this.latestRequest;
    this.query.set(text);

    const barcode = asBarcode(text);
    if (!barcode) {
      this.status.set("needsBarcode");

      return;
    }

    this.status.set("loading");
    this.openFoodFacts.getByBarcode(barcode).subscribe({
      next: (product) => this.ifCurrent(request, () => (product ? this.showProduct(product) : this.status.set("notFound"))),
      error: () => this.ifCurrent(request, () => this.status.set("error")),
    });
  }

  /** Shows a product (a lookup, or one of the recent scans) and remembers it. */
  public showProduct(product: CheckedProduct): void {
    this.latestRequest++;
    this.product.set(product);
    this.status.set("product");
    this.recent.add(product);
  }

  private ifCurrent(request: number, action: () => void): void {
    if (request === this.latestRequest) {
      action();
    }
  }
}
