import { Injectable, signal } from "@angular/core";
import { CheckedProduct } from "./product-check.models";

export const RECENT_PRODUCTS_KEY = "rw_recent_products";
export const RECENT_PRODUCTS_LIMIT = 10;

/**
 * The last products someone checked, kept in this browser only (never sent anywhere), so two or three items from the
 * same aisle can be flipped between without asking Open Food Facts again. Storage can be missing or refuse writes
 * (private windows, blocked site data), so every access is guarded and the list still works for the page's lifetime.
 */
@Injectable({ providedIn: "root" })
export class RecentProductsService {
  private readonly items = signal<CheckedProduct[]>(this.read());

  /** Newest first. */
  public readonly products = this.items.asReadonly();

  public add(product: CheckedProduct): void {
    const next = [product, ...this.items().filter((item) => item.code !== product.code)].slice(0, RECENT_PRODUCTS_LIMIT);
    this.items.set(next);
    this.write(next);
  }

  public clear(): void {
    this.items.set([]);
    this.write([]);
  }

  private read(): CheckedProduct[] {
    try {
      const parsed = JSON.parse(globalThis.localStorage?.getItem(RECENT_PRODUCTS_KEY) ?? "[]");

      return Array.isArray(parsed)
        ? parsed.filter((item) => item && typeof item.code === "string" && typeof item.name === "string").slice(0, RECENT_PRODUCTS_LIMIT)
        : [];
    } catch {
      return [];
    }
  }

  private write(products: CheckedProduct[]): void {
    try {
      globalThis.localStorage?.setItem(RECENT_PRODUCTS_KEY, JSON.stringify(products));
    } catch {
      // The list is a convenience; without storage it simply does not survive a reload.
    }
  }
}
