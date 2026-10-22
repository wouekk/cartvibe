import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmInputGroupImports } from "@spartan-ng/helm/input-group";
import { AppDialogRef } from "../dialog/app-dialog";
import { marker } from "../i18n/marker";
import { TranslatePipe } from "../i18n/translate.pipe";
import { AppIconComponent } from "../shared-ui/icon/icon.component";
import { BarcodePhotoActionsComponent } from "./barcode-photo-actions.component";
import { canUseCamera } from "./barcode-scanner.service";
import { AdditiveInfo, describeAdditives } from "./e-additives";
import { computeHealthScore, HealthTone, healthTone } from "./health-score";
import { CheckedProduct, NutrientLevel, NutriScore } from "./product-check.models";
import { ProductCheckService } from "./product-check.service";

const NUTRI_CLASSES: Record<NutriScore, string> = {
  a: "bg-nutri-a text-white",
  b: "bg-nutri-b text-black",
  c: "bg-nutri-c text-black",
  d: "bg-nutri-d text-white",
  e: "bg-nutri-e text-white",
};

const TONE_CLASSES: Record<HealthTone, string> = {
  good: "bg-success-text/15 text-success-text",
  fair: "bg-warning-text/15 text-warning-text",
  poor: "bg-destructive/15 text-destructive",
};

const NOVA_CLASSES: Record<number, string> = {
  1: "bg-success-text/15 text-success-text",
  2: "bg-success-text/15 text-success-text",
  3: "bg-warning-text/15 text-warning-text",
  4: "bg-destructive/15 text-destructive",
};

const RISK_CLASSES: Record<string, string> = {
  high: "bg-destructive/15 text-destructive",
  moderate: "bg-warning-text/15 text-warning-text",
  safe: "bg-success-text/15 text-success-text",
};

const LEVEL_DOT: Record<NutrientLevel, string> = {
  low: "bg-success-text",
  moderate: "bg-warning-text",
  high: "bg-destructive",
};

interface NutritionRow {
  key: string;
  label: string;
  value: string;
  level: NutrientLevel | null;
}

/**
 * The slide-over that shows what the product checker found: a verdict (health score, Nutri-Score, NOVA group), the
 * additives with their risk, and the nutrition per 100 g. It reads `ProductCheckService`, which the header input and the
 * barcode scanner feed, so one drawer serves a typed barcode and a scan alike.
 */
@Component({
  selector: "app-product-check-drawer",
  standalone: true,
  imports: [HlmButton, HlmInputGroupImports, AppIconComponent, BarcodePhotoActionsComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "flex h-full min-h-0 flex-col", "data-testid": "product-check-drawer" },
  template: `
    <header class="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
      <h2 class="m-0 text-sm font-semibold">{{ 'Check a product' | t }}</h2>
      <button hlmBtn variant="ghost" size="icon" type="button" data-testid="product-check-close" [attr.aria-label]="'Close' | t" (click)="close()">
        <app-icon name="close"></app-icon>
      </button>
    </header>

    <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 [&>*]:shrink-0">
      <!-- Without live video (plain http, no device) a photo of the code, or the typed digits, is the way in. The photo
           buttons are native labels over file inputs so the phone opens its camera from the tap itself. -->
      @if (!cameraAvailable) {
        <app-barcode-photo-actions variant="bar" (barcodeFound)="useCode($event, barcode)" (notFound)="photoNotFound()"></app-barcode-photo-actions>
        <div hlmInputGroup data-testid="product-check-barcode-box">
          <input
            #barcode
            hlmInputGroupInput
            type="text"
            inputmode="numeric"
            enterkeyhint="search"
            autocomplete="off"
            data-testid="product-check-barcode"
            [placeholder]="'Enter a barcode…' | t"
            [attr.aria-label]="'Enter a barcode' | t"
            (keydown.enter)="lookup(barcode.value)"
          />
          <div hlmInputGroupAddon align="inline-end">
            <app-barcode-photo-actions variant="icon" (barcodeFound)="useCode($event, barcode)" (notFound)="photoNotFound()"></app-barcode-photo-actions>
          </div>
        </div>
      }

      @if (recent().length) {
        <div class="cv-scroll-x -mx-1 flex gap-2 px-1" role="list" [attr.aria-label]="'Recent scans' | t" data-testid="product-check-recent">
          @for (item of recent(); track item.code) {
            <button
              type="button"
              role="listitem"
              class="inline-flex h-8 max-w-48 shrink-0 items-center gap-2 rounded-full border border-border px-3 text-xs transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none"
              [class.bg-accent]="isCurrent(item)"
              [attr.aria-current]="isCurrent(item) ? 'true' : null"
              [attr.data-testid]="'product-check-recent-' + item.code"
              (click)="show(item)"
            >
              <span class="size-2 shrink-0 rounded-full" [class]="dotClass(item)"></span>
              <span class="truncate">{{ item.name | t }}</span>
              <span class="shrink-0 font-semibold tabular-nums">{{ score(item) }}</span>
            </button>
          }
        </div>
      }

      @switch (status()) {
        @case ('loading') {
          <div class="flex flex-col gap-3" data-testid="product-check-loading" aria-busy="true">
            <div class="h-24 animate-pulse rounded-xl bg-muted"></div>
            <div class="h-32 animate-pulse rounded-xl bg-muted"></div>
          </div>
        }
        @case ('notFound') {
          <p class="m-0 rounded-xl border border-border p-4 text-sm text-muted-foreground" data-testid="product-check-not-found">
            {{ 'Not found in Open Food Facts.' | t }}
          </p>
        }
        @case ('photoFailed') {
          <p class="m-0 rounded-xl border border-destructive/40 p-4 text-sm text-destructive" role="alert" data-testid="product-check-photo-failed">
            {{ 'No barcode was found in that photo. Try again with the bars sharp and filling the frame.' | t }}
          </p>
        }
        @case ('error') {
          <p class="m-0 rounded-xl border border-destructive/40 p-4 text-sm text-destructive" role="alert" data-testid="product-check-error">
            {{ 'Could not reach Open Food Facts. Check your connection and try again.' | t }}
          </p>
        }
        @case ('needsBarcode') {
          <p class="m-0 rounded-xl border border-border p-4 text-sm text-muted-foreground" data-testid="product-check-needs-barcode">
            {{ 'That is not a barcode. Enter the 8, 12 or 13 digits printed under the bars, or scan the code with the camera.' | t }}
          </p>
        }
        @case ('product') {
          @if (product(); as current) {
            <div class="cv-card" data-testid="product-check-product">
              <div class="cv-card__body">
                <div class="cv-section">
                  <div class="flex items-start gap-3">
                    @if (current.imageUrl) {
                      <img [src]="current.imageUrl" alt="" loading="lazy" referrerpolicy="no-referrer" class="size-16 shrink-0 rounded-lg border border-border bg-muted object-contain" />
                    } @else {
                      <span class="inline-flex size-16 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
                        <app-icon name="barcode_scanner" class="text-2xl"></app-icon>
                      </span>
                    }
                    <div class="min-w-0">
                      @if (current.brand) {
                        <div class="text-[0.6875rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">{{ current.brand }}</div>
                      }
                      <div class="text-base font-semibold break-words" data-testid="product-check-name">{{ current.name | t }}</div>
                      <div class="text-xs text-muted-foreground tabular-nums">{{ current.code }}</div>
                    </div>
                  </div>

                  <div class="grid grid-cols-3 gap-2">
                    <div class="flex flex-col gap-1 rounded-lg px-3 py-2" [class]="toneClass()" data-testid="product-check-score">
                      <span class="text-[0.6875rem] font-semibold tracking-[0.08em] uppercase opacity-80">{{ 'Health score' | t }}</span>
                      <span class="text-2xl leading-none font-bold tabular-nums">{{ healthScore() }}<span class="text-xs font-medium opacity-70"> / 100</span></span>
                    </div>
                    <div class="flex flex-col gap-1 rounded-lg bg-muted px-3 py-2" data-testid="product-check-nutriscore">
                      <span class="text-[0.6875rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">Nutri-Score</span>
                      @if (current.nutriScore; as grade) {
                        <span class="inline-flex size-7 items-center justify-center rounded-md text-base font-bold uppercase" [class]="nutriClass(grade)">{{ grade }}</span>
                      } @else {
                        <span class="text-sm text-muted-foreground">—</span>
                      }
                    </div>
                    <div class="flex flex-col gap-1 rounded-lg px-3 py-2" [class]="novaClass(current)" data-testid="product-check-nova">
                      <span class="text-[0.6875rem] font-semibold tracking-[0.08em] uppercase opacity-80">NOVA</span>
                      @if (current.nova) {
                        <span class="text-2xl leading-none font-bold tabular-nums">{{ current.nova }}</span>
                      } @else {
                        <span class="text-sm opacity-70">—</span>
                      }
                    </div>
                  </div>
                  <p class="m-0 text-xs text-muted-foreground">{{ 'A general guide from Nutri-Score, NOVA and the additives, not medical advice.' | t }}</p>
                </div>

                <div class="cv-section">
                  <div class="cv-section__head">
                    <h3 class="cv-section__title">{{ 'Additives' | t }}</h3>
                  </div>
                  @if (additives().length) {
                    <ul class="cv-list" data-testid="product-check-additives">
                      @for (additive of additives(); track additive.code) {
                        <li [attr.data-testid]="'product-check-additive-' + additive.code">
                          <span class="min-w-0 text-sm">
                            <span class="font-medium tabular-nums">{{ additive.code }}</span> · {{ additive.name }}
                            @if (additive.category) {
                              <span class="block text-xs text-muted-foreground">{{ additive.category | t }}</span>
                            }
                          </span>
                          <span class="shrink-0 rounded-md px-2 py-0.5 text-[0.6875rem] font-semibold uppercase" [class]="riskClass(additive)">{{ riskLabel(additive) | t }}</span>
                        </li>
                      }
                    </ul>
                  } @else {
                    <p class="m-0 text-sm text-muted-foreground">{{ 'No additives listed.' | t }}</p>
                  }
                </div>

                <div class="cv-section">
                  <div class="cv-section__head">
                    <h3 class="cv-section__title">{{ 'Nutrition per 100 g' | t }}</h3>
                  </div>
                  <div class="cv-inset">
                    <ul class="cv-list" data-testid="product-check-nutrition">
                      @for (row of nutrition(); track row.key) {
                        <li [attr.data-testid]="'product-check-nutrient-' + row.key">
                          <span class="inline-flex items-center gap-2 text-sm">
                            @if (row.level) {
                              <span class="size-2 rounded-full" [class]="levelDot(row.level)" [attr.title]="row.level | t"></span>
                            } @else {
                              <span class="size-2"></span>
                            }
                            {{ row.label | t }}
                          </span>
                          <span class="text-sm font-medium">{{ row.value }}</span>
                        </li>
                      }
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          }
        }
        @default {
          <p class="m-0 text-sm text-muted-foreground" data-testid="product-check-idle">
            {{ 'Enter the barcode printed under the bars.' | t }}
          </p>
        }
      }
    </div>
  `,
})
export class ProductCheckDrawerComponent {
  private readonly service = inject(ProductCheckService);
  private readonly dialogRef = inject(AppDialogRef);

  protected readonly status = this.service.status;
  protected readonly product = this.service.product;
  protected readonly recent = this.service.recentProducts;

  protected readonly healthScore = computed(() => {
    const product = this.product();

    return product ? computeHealthScore(product) : 0;
  });

  protected readonly toneClass = computed(() => TONE_CLASSES[healthTone(this.healthScore())]);

  protected readonly additives = computed<AdditiveInfo[]>(() => describeAdditives(this.product()?.additiveTags ?? []));

  protected readonly nutrition = computed<NutritionRow[]>(() => {
    const product = this.product();
    if (!product) {
      return [];
    }
    const { nutrition, levels } = product;

    return [
      { key: "sugars", label: marker("Sugars"), value: grams(nutrition.sugars), level: levels.sugars },
      { key: "saturatedFat", label: marker("Saturated fat"), value: grams(nutrition.saturatedFat), level: levels.saturatedFat },
      { key: "salt", label: marker("Salt"), value: grams(nutrition.salt), level: levels.salt },
      { key: "fiber", label: marker("Fibre"), value: grams(nutrition.fiber), level: null },
      { key: "proteins", label: marker("Protein"), value: grams(nutrition.proteins), level: null },
      { key: "energy", label: marker("Calories"), value: nutrition.energyKcal === null ? "—" : `${Math.round(nutrition.energyKcal)} kcal`, level: null },
    ];
  });

  /** Typing a barcode is the way in when the browser offers no camera. */
  protected readonly cameraAvailable = canUseCamera();

  protected lookup(value: string): void {
    this.service.check(value);
  }

  /** A barcode read from a photo fills the box and is looked up. */
  protected useCode(code: string, input: HTMLInputElement): void {
    input.value = code;
    this.service.check(code);
  }

  protected photoNotFound(): void {
    this.service.photoFailed();
  }

  protected show(product: CheckedProduct): void {
    this.service.showProduct(product);
  }

  protected close(): void {
    this.dialogRef.close();
  }

  protected isCurrent(item: CheckedProduct): boolean {
    return this.status() === "product" && this.product()?.code === item.code;
  }

  protected score(item: CheckedProduct): number {
    return computeHealthScore(item);
  }

  protected dotClass(item: CheckedProduct): string {
    return { good: "bg-success-text", fair: "bg-warning-text", poor: "bg-destructive" }[healthTone(computeHealthScore(item))];
  }

  protected nutriClass(grade: NutriScore): string {
    return NUTRI_CLASSES[grade];
  }

  protected novaClass(product: CheckedProduct): string {
    return product.nova ? NOVA_CLASSES[product.nova] : "bg-muted text-muted-foreground";
  }

  protected riskClass(additive: AdditiveInfo): string {
    return additive.risk ? RISK_CLASSES[additive.risk] : "bg-muted text-muted-foreground";
  }

  protected riskLabel(additive: AdditiveInfo): string {
    return additive.risk ? { high: marker("High risk"), moderate: marker("Moderate"), safe: marker("Safe") }[additive.risk] : marker("Unknown");
  }

  protected levelDot(level: NutrientLevel): string {
    return LEVEL_DOT[level];
  }
}

function grams(value: number | null): string {
  if (value === null) {
    return "—";
  }

  return `${Number(value.toFixed(value < 1 ? 2 : value < 10 ? 1 : 0))} g`;
}
