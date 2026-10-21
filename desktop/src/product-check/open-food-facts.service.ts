import { HttpBackend, HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { map, Observable } from "rxjs";
import { CheckedProduct, NutrientLevel, NutriScore, ProductNutrientLevels, ProductNutrition } from "./product-check.models";

export const OPEN_FOOD_FACTS_URL = "https://world.openfoodfacts.org";

const FIELDS = [
  "code",
  "product_name",
  "brands",
  "image_front_small_url",
  "nutriscore_grade",
  "nova_group",
  "additives_tags",
  "nutriments",
  "nutrient_levels",
].join(",");

const SEARCH_RESULTS = 10;

/** The parts of an Open Food Facts product this service reads; everything is optional on their side. */
interface OffProduct {
  code?: string;
  product_name?: string;
  brands?: string;
  image_front_small_url?: string;
  nutriscore_grade?: string;
  nova_group?: number | string;
  additives_tags?: string[];
  nutriments?: Record<string, number | string | undefined>;
  nutrient_levels?: Record<string, string | undefined>;
}

/**
 * Reads Open Food Facts straight from the browser. Nothing of it is stored on our side: the answer is turned into a small
 * `CheckedProduct` and the recent scans keep it in the browser's own storage.
 *
 * The HTTP client is built on `HttpBackend`, which skips the app's interceptors: they attach the household's
 * credentials, toast failures and handle sign-in, none of which belongs on a request to a third party. Their API is rate
 * limited (about ten searches a minute), so a text search only ever runs on an explicit Enter, never per keystroke.
 */
@Injectable({ providedIn: "root" })
export class OpenFoodFactsService {
  private readonly http = new HttpClient(inject(HttpBackend));

  /** The product with this barcode, or null when Open Food Facts does not know it. */
  public getByBarcode(code: string): Observable<CheckedProduct | null> {
    return this.http
      .get<{ status?: number; product?: OffProduct }>(`${OPEN_FOOD_FACTS_URL}/api/v2/product/${encodeURIComponent(code)}.json`, {
        params: { fields: FIELDS },
      })
      .pipe(map((response) => (response?.status === 1 && response.product ? toCheckedProduct(response.product, code) : null)));
  }

  /** The best matches for a product name. */
  public search(text: string): Observable<CheckedProduct[]> {
    return this.http
      .get<{ products?: OffProduct[] }>(`${OPEN_FOOD_FACTS_URL}/cgi/search.pl`, {
        params: {
          search_terms: text,
          search_simple: "1",
          action: "process",
          json: "1",
          page_size: String(SEARCH_RESULTS),
          fields: FIELDS,
        },
      })
      .pipe(
        map((response) =>
          (response?.products ?? [])
            .filter((product) => !!product.code && !!product.product_name)
            .map((product) => toCheckedProduct(product, product.code as string))
        )
      );
  }
}

export function toCheckedProduct(product: OffProduct, fallbackCode: string): CheckedProduct {
  return {
    code: product.code || fallbackCode,
    name: (product.product_name ?? "").trim() || "Unnamed product",
    brand: (product.brands ?? "").split(",")[0].trim(),
    imageUrl: product.image_front_small_url ?? null,
    nutriScore: toNutriScore(product.nutriscore_grade),
    nova: toNova(product.nova_group),
    additiveTags: Array.isArray(product.additives_tags) ? product.additives_tags : [],
    nutrition: toNutrition(product.nutriments ?? {}),
    levels: toLevels(product.nutrient_levels ?? {}),
  };
}

function toNutriScore(grade: string | undefined): NutriScore | null {
  const letter = (grade ?? "").toLowerCase();

  return ["a", "b", "c", "d", "e"].includes(letter) ? (letter as NutriScore) : null;
}

function toNova(group: number | string | undefined): 1 | 2 | 3 | 4 | null {
  const value = Number(group);

  return value === 1 || value === 2 || value === 3 || value === 4 ? value : null;
}

function toNumber(value: number | string | undefined): number | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function toNutrition(nutriments: Record<string, number | string | undefined>): ProductNutrition {
  return {
    energyKcal: toNumber(nutriments["energy-kcal_100g"]),
    sugars: toNumber(nutriments["sugars_100g"]),
    saturatedFat: toNumber(nutriments["saturated-fat_100g"]),
    salt: toNumber(nutriments["salt_100g"]),
    fiber: toNumber(nutriments["fiber_100g"]),
    proteins: toNumber(nutriments["proteins_100g"]),
  };
}

function toLevel(level: string | undefined): NutrientLevel | null {
  return level === "low" || level === "moderate" || level === "high" ? level : null;
}

function toLevels(levels: Record<string, string | undefined>): ProductNutrientLevels {
  return {
    sugars: toLevel(levels["sugars"]),
    saturatedFat: toLevel(levels["saturated-fat"]),
    salt: toLevel(levels["salt"]),
    fat: toLevel(levels["fat"]),
  };
}
