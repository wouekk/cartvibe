import { HttpErrorResponse, provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ReactiveFormsModule } from "@angular/forms";
import { provideRouter } from "@angular/router";
import { NgxsModule, Store } from "@ngxs/store";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmCheckbox } from "@spartan-ng/helm/checkbox";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { of, throwError } from "rxjs";
import type { Mock } from "vitest";
import { APP_DIALOG_DATA, AppDialogRef } from "../../dialog/app-dialog";
import { InputModule } from "../../input";
import {
  ImportShoppingListRecipeResult,
  RecipePreview,
  ShoppingList,
  ShoppingListItem,
  ShoppingListService,
} from "../../open-api";
import { SelectModule } from "../../select/select.module";
import { SnackbarService } from "../../services";
import { AppIconComponent } from "../../shared-ui/icon/icon.component";
import { SharedUiModule } from "../../shared-ui/shared-ui.module";
import { ShoppingListEventType, ShoppingListStore } from "../../store/shopping-list.store";
import { TextareaModule } from "../../textarea/textarea.module";
import { RecipeImportDialogComponent, RecipeImportDialogData } from "./recipe-import-dialog.component";

const item = (id: number, name: string, isChecked = false): ShoppingListItem =>
  ({ id, shoppingListId: 1, name, unit: "", quantity: "", note: "", isChecked }) as ShoppingListItem;

const supermarket: ShoppingList = {
  id: 1,
  groupId: 1,
  name: "Supermarket",
  items: [item(1, "Milk"), item(2, "Eggs", true), item(3, "  Mąka  pszenna ")],
};
const market: ShoppingList = { id: 2, groupId: 1, name: "Market", items: [item(4, "Czosnek")] };

const row = (name: string, quantity: string | null, unit = "") => ({ name, quantity, unit, original: name }) as never;

const pancakes = (overrides: Partial<RecipePreview> = {}): RecipePreview => ({
  title: "Pancakes",
  sourceUrl: "https://example.com/pancakes",
  servings: 4,
  source: "jsonld",
  failureReason: "",
  items: [
    row("flour", "200", "g"),
    row("Milk", "0.5", "l"),
    row("eggs", "2"),
    row("mąka pszenna", "0.33", "szklanki"),
    row("salt", null),
  ],
  ...overrides,
});

describe("RecipeImportDialogComponent", () => {
  let fixture: ComponentFixture<RecipeImportDialogComponent>;
  let service: { previewShoppingListRecipe: Mock; importShoppingListRecipe: Mock };
  let dialogRef: { close: Mock };
  let snackbar: { success: Mock };
  let store: Store;

  let dialogData: RecipeImportDialogData;

  const create = async (data: Partial<RecipeImportDialogData> = {}) => {
    dialogData = { groupId: 1, lists: [supermarket, market], listId: 1, ...data };
    fixture = TestBed.createComponent(RecipeImportDialogComponent);
    await fixture.whenStable();
  };

  const el = (testId: string): HTMLElement | null => fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);

  const type = async (testId: string, selector: string, value: string) => {
    const field = el(testId)!.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement;
    field.value = value;
    field.dispatchEvent(new Event("input"));
    await fixture.whenStable();
  };

  const click = async (target: Element | null) => {
    (target as HTMLElement).click();
    await fixture.whenStable();
  };

  // jsdom does not implement requestSubmit(), which the Preview button uses, so the form's submit event is sent directly.
  const submit = async () => {
    const form = el("recipe-import-input-step");
    if (form) {
      form.dispatchEvent(new Event("submit", { cancelable: true }));
      await fixture.whenStable();
      return;
    }
    await click(fixture.nativeElement.querySelector('[data-testid="dialog-submit-button"] button'));
  };

  const submitDisabled = () =>
    (fixture.nativeElement.querySelector('[data-testid="dialog-submit-button"] button') as HTMLButtonElement).disabled;

  const preview = async (value: RecipePreview = pancakes()) => {
    service.previewShoppingListRecipe.mockReturnValue(of(value));
    await type("recipe-import-url", "input", "https://example.com/pancakes");
    await submit();
  };

  const quantity = (index: number) => el(`recipe-row-quantity-${index}`)!.textContent!.replace(/\s+/g, " ").trim();
  const rowCheckbox = (index: number) => el(`recipe-row-check-${index}`)!.querySelector('[role="checkbox"]') as HTMLElement;

  beforeEach(async () => {
    service = {
      previewShoppingListRecipe: vi.fn(),
      importShoppingListRecipe: vi.fn(),
    };
    dialogRef = { close: vi.fn() };
    snackbar = { success: vi.fn() };

    await TestBed.configureTestingModule({
    imports: [
        NgxsModule.forRoot([]),
        HlmButton,
        HlmCheckbox,
        HlmSpinner,
        AppIconComponent,
        InputModule,
        ReactiveFormsModule,
        SelectModule,
        SharedUiModule,
        TextareaModule,
        RecipeImportDialogComponent,
    ],
    providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AppDialogRef, useValue: dialogRef },
        { provide: APP_DIALOG_DATA, useFactory: () => dialogData },
        { provide: ShoppingListService, useValue: service },
        { provide: SnackbarService, useValue: snackbar },
    ],
}).compileComponents();

    store = TestBed.inject(Store);
  });

  afterEach(() => TestBed.resetTestingModule());

  describe("input step", () => {
    it("starts on the link tab, with Preview unavailable until a web address is typed", async () => {
      await create();

      expect(el("recipe-import-url")).not.toBeNull();
      expect(el("recipe-import-text")).toBeNull();
      expect(submitDisabled()).toBe(true);

      await type("recipe-import-url", "input", "not a link");
      expect(submitDisabled()).toBe(true);

      await type("recipe-import-url", "input", "https://example.com/x");
      expect(submitDisabled()).toBe(false);
    });

    it("accepts a link typed without https://", async () => {
      await create();
      service.previewShoppingListRecipe.mockReturnValue(of(pancakes()));

      await type("recipe-import-url", "input", "allrecipes.com/recipe/1/");
      await submit();

      expect(service.previewShoppingListRecipe).toHaveBeenCalledWith(1, { url: "https://allrecipes.com/recipe/1/" });
    });

    it("opens on the paste tab when a shared text arrives without a link", async () => {
      await create({ text: "2 eggs" });

      expect(el("recipe-import-text")).not.toBeNull();
      expect((el("recipe-import-text")!.querySelector("textarea") as HTMLTextAreaElement).value).toBe("2 eggs");
    });

    it("pre-fills a shared link without fetching it", async () => {
      await create({ url: "https://example.com/shared" });

      expect((el("recipe-import-url")!.querySelector("input") as HTMLInputElement).value).toBe("https://example.com/shared");
      expect(service.previewShoppingListRecipe).not.toHaveBeenCalled();
    });

    it("sends pasted text as text", async () => {
      await create();
      service.previewShoppingListRecipe.mockReturnValue(of(pancakes({ source: "text", sourceUrl: "", title: "" })));

      await click(el("recipe-import-mode-text"));
      await type("recipe-import-text", "textarea", "200 g flour\n2 eggs");
      await submit();

      expect(service.previewShoppingListRecipe).toHaveBeenCalledWith(1, { text: "200 g flour\n2 eggs" });
      expect(el("recipe-import-preview-step")).not.toBeNull();
    });

    it("moves to the paste tab with guidance when a site blocks reading", async () => {
      await create();
      service.previewShoppingListRecipe.mockReturnValue(
        of({ title: "", sourceUrl: "https://blocked.example/x", servings: undefined, source: "", failureReason: "blocked", items: [] } as unknown as RecipePreview)
      );

      await type("recipe-import-url", "input", "https://blocked.example/x");
      await submit();

      expect(el("recipe-import-text")).not.toBeNull();
      expect(el("recipe-import-url")).toBeNull();
      expect(el("recipe-import-hint")!.textContent).toContain("does not allow its recipes to be read");
      expect(el("recipe-import-preview-step")).toBeNull();
    });

    it.each(["timeout", "unreachable", "not_found", "not_html", "too_large", "no_recipe", "busy", "something_new"])(
      "falls back to pasting for the reason %s",
      async (failureReason) => {
        await create();
        service.previewShoppingListRecipe.mockReturnValue(
          of({ title: "", sourceUrl: "", servings: undefined, source: "", failureReason, items: [] } as unknown as RecipePreview)
        );

        await type("recipe-import-url", "input", "https://example.com/x");
        await submit();

        expect(el("recipe-import-text")).not.toBeNull();
        expect(el("recipe-import-hint")!.textContent!.trim().length).toBeGreaterThan(10);
      }
    );

    it("stays on the paste tab and says what to change when the text holds no ingredients", async () => {
      await create({ text: "hello" });
      service.previewShoppingListRecipe.mockReturnValue(
        of({ title: "", sourceUrl: "", servings: undefined, source: "text", failureReason: "no_ingredients", items: [] } as unknown as RecipePreview)
      );

      await submit();

      expect(el("recipe-import-text")).not.toBeNull();
      expect(el("recipe-import-hint")!.textContent).toContain("200 g flour");
    });

    it("explains a rate limit next to the field and keeps the person where they are", async () => {
      await create();
      service.previewShoppingListRecipe.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 429 })));

      await type("recipe-import-url", "input", "https://example.com/x");
      await submit();

      expect(el("recipe-import-hint")).not.toBeNull();
      expect(el("recipe-import-url")).not.toBeNull();
      expect(submitDisabled()).toBe(false);
    });

    it("lets the person correct and retry after another error", async () => {
      await create();
      service.previewShoppingListRecipe.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));

      await type("recipe-import-url", "input", "https://example.com/x");
      await submit();

      expect(el("recipe-import-url")).not.toBeNull();
      expect(el("recipe-import-loading")).toBeNull();
      expect(submitDisabled()).toBe(false);
    });

    it("does not ask which list when it was opened from the list itself", async () => {
      await create();

      expect(el("recipe-import-list")).toBeNull();
    });

    it("asks which list for a shared recipe", async () => {
      await create({ askForList: true });

      expect(el("recipe-import-list")).not.toBeNull();
    });

    it("does not ask when there is only one list to choose", async () => {
      await create({ askForList: true, lists: [supermarket] });

      expect(el("recipe-import-list")).toBeNull();
    });
  });

  describe("preview step", () => {
    it("shows the title, the servings and one ticked row per ingredient", async () => {
      await create();
      await preview();

      expect(el("recipe-import-title")!.textContent).toBe("Pancakes");
      expect(el("recipe-servings-value")!.textContent!.trim()).toBe("4 servings");
      expect(el("recipe-import-selected")!.textContent!.trim()).toBe("5 of 5 selected");
      expect(el("recipe-row-name-0")!.textContent!.trim()).toBe("flour");
      expect(quantity(0)).toBe("200 g");
      expect(quantity(2)).toBe("2");
      expect(quantity(4)).toBe("");
      for (let index = 0; index < 5; index++) {
        expect(rowCheckbox(index).getAttribute("aria-checked")).toBe("true");
      }
    });

    it("shows no servings control when the recipe states none", async () => {
      await create();
      await preview(pancakes({ servings: undefined as unknown as number }));

      expect(el("recipe-servings")).toBeNull();
      expect(el("recipe-import-multipliers")).not.toBeNull();
    });

    it("marks the names that are still to buy on the target list, and not the crossed-off ones", async () => {
      await create();
      await preview(pancakes({ items: [row("milk ", "1", "l"), row("Eggs", "6"), row("MĄKA  pszenna", "1"), row("butter", "100", "g")] }));

      expect(el("recipe-row-on-list-0")).not.toBeNull();
      expect(el("recipe-row-on-list-1")).toBeNull();
      expect(el("recipe-row-on-list-2")).not.toBeNull();
      expect(el("recipe-row-on-list-3")).toBeNull();
    });

    it("judges 'On list' against the list picked in the dialog", async () => {
      await create({ askForList: true });
      await preview(pancakes({ items: [row("Czosnek", "2", "ząbki"), row("Milk", "1", "l")] }));

      expect(el("recipe-row-on-list-0")).toBeNull();
      expect(el("recipe-row-on-list-1")).not.toBeNull();

      await click(el("recipe-import-back"));
      const list = fixture.componentInstance as unknown as { listControl: { setValue(id: number): void } };
      list.listControl.setValue(2);
      await fixture.whenStable();
      await submit();

      expect(el("recipe-row-on-list-0")).not.toBeNull();
      expect(el("recipe-row-on-list-1")).toBeNull();
    });

    describe("portion multiplier", () => {
      const cases: [string, string[]][] = [
        ["0.5", ["100 g", "0.25 l", "1", "0.17 szklanki", ""]],
        ["1", ["200 g", "0.5 l", "2", "0.33 szklanki", ""]],
        ["1.5", ["300 g", "0.75 l", "3", "0.5 szklanki", ""]],
        ["2", ["400 g", "1 l", "4", "0.66 szklanki", ""]],
        ["3", ["600 g", "1.5 l", "6", "1 szklanki", ""]],
      ];
      for (const [multiplier, expected] of cases) {
        it(`${multiplier}× scales every quantity from the original, snapping thirds`, async () => {
          await create();
          await preview();

          await click(el(`recipe-multiplier-${multiplier}`));

          expect([0, 1, 2, 3, 4].map(quantity)).toEqual(expected);
        });
      }

      it("goes back to the exact original at 1×", async () => {
        await create();
        await preview();

        await click(el("recipe-multiplier-3"));
        await click(el("recipe-multiplier-1"));

        expect(quantity(3)).toBe("0.33 szklanki");
      });

      it("keeps the servings in step with the multiplier", async () => {
        await create();
        await preview();

        await click(el("recipe-multiplier-1.5"));
        expect(el("recipe-servings-value")!.textContent!.trim()).toBe("6 servings");

        await click(el("recipe-multiplier-0.5"));
        expect(el("recipe-servings-value")!.textContent!.trim()).toBe("2 servings");
      });
    });

    describe("servings stepper", () => {
      it("scales by target servings over base servings", async () => {
        await create();
        await preview();

        await click(el("recipe-servings-increment"));
        expect(el("recipe-servings-value")!.textContent!.trim()).toBe("5 servings");
        expect(quantity(0)).toBe("250 g");

        await click(el("recipe-servings-decrement"));
        await click(el("recipe-servings-decrement"));
        expect(el("recipe-servings-value")!.textContent!.trim()).toBe("3 servings");
        expect(quantity(0)).toBe("150 g");
        expect(quantity(1)).toBe("0.38 l");
      });

      it("stops at one serving", async () => {
        await create();
        await preview(pancakes({ servings: 2 }));

        await click(el("recipe-servings-decrement"));
        expect(el("recipe-servings-value")!.textContent!.trim()).toBe("1 serving");
        expect((el("recipe-servings-decrement") as HTMLButtonElement).disabled).toBe(true);
      });
    });

    describe("choosing what to add", () => {
      it("un-ticks a row, counts the rest and names the count on the button", async () => {
        await create();
        await preview();

        await click(rowCheckbox(4));
        await click(rowCheckbox(2));

        expect(rowCheckbox(4).getAttribute("aria-checked")).toBe("false");
        expect(el("recipe-import-selected")!.textContent!.trim()).toBe("3 of 5 selected");
        expect(el("dialog-submit-button")!.textContent).toContain("Add 3 items");
      });

      it("disables Add when nothing is ticked and says so", async () => {
        await create();
        await preview(pancakes({ items: [row("flour", "200", "g")] }));

        await click(rowCheckbox(0));

        expect(submitDisabled()).toBe(true);
        expect(el("recipe-import-none-selected")).not.toBeNull();
        expect(el("dialog-submit-button")!.textContent).toContain("Add 0 items");
      });

      it("singularises the button for one row", async () => {
        await create();
        await preview(pancakes({ items: [row("flour", "200", "g")] }));

        expect(el("dialog-submit-button")!.textContent).toContain("Add 1 item");
      });

      it("goes back to the input, keeping what was typed", async () => {
        await create();
        await preview();

        await click(el("recipe-import-back"));

        expect(el("recipe-import-url")).not.toBeNull();
        expect((el("recipe-import-url")!.querySelector("input") as HTMLInputElement).value).toBe("https://example.com/pancakes");
      });
    });

    describe("adding", () => {
      const result = (): ImportShoppingListRecipeResult => ({
        list: { ...supermarket, name: "Supermarket" },
        added: 2,
        merged: 1,
        revived: 0,
      });

      it("sends only the ticked rows, at the scaled quantities, with the recipe's own units", async () => {
        await create();
        service.importShoppingListRecipe.mockReturnValue(of(result()));
        await preview();

        await click(el("recipe-multiplier-3"));
        await click(rowCheckbox(4)); // salt, a pantry staple
        await click(rowCheckbox(1)); // milk
        await submit();

        expect(service.importShoppingListRecipe).toHaveBeenCalledWith(1, {
          items: [
            { name: "flour", amount: "600", unit: "g" },
            { name: "eggs", amount: "6", unit: "" },
            { name: "mąka pszenna", amount: "1", unit: "szklanki" },
          ],
        });
      });

      it("sends a row without a quantity without an amount", async () => {
        await create();
        service.importShoppingListRecipe.mockReturnValue(of(result()));
        await preview(pancakes({ items: [row("salt", null)] }));

        await submit();

        expect(service.importShoppingListRecipe).toHaveBeenCalledWith(1, { items: [{ name: "salt" }] });
      });

      it("targets the list picked in the dialog", async () => {
        await create({ askForList: true });
        service.importShoppingListRecipe.mockReturnValue(of(result()));
        const picker = fixture.componentInstance as unknown as { listControl: { setValue(id: number): void } };
        picker.listControl.setValue(2);
        await preview(pancakes({ items: [row("flour", "1", "kg")] }));

        await submit();

        expect(service.importShoppingListRecipe).toHaveBeenCalledWith(2, { items: [{ name: "flour", amount: "1", unit: "kg" }] });
      });

      it("puts the merged list in the store, tells the person and closes", async () => {
        await create();
        const applyEvent = vi.spyOn(TestBed.inject(ShoppingListStore), "applyEvent");
        const merged = { ...supermarket, items: [item(1, "Milk"), item(9, "flour")] };
        service.importShoppingListRecipe.mockReturnValue(of({ ...result(), list: merged }));
        await preview();

        await submit();

        expect(applyEvent).toHaveBeenCalledWith({
          type: ShoppingListEventType.ListUpdated,
          groupId: 1,
          shoppingListId: 1,
          list: merged,
        });
        expect(snackbar.success).toHaveBeenCalledWith("Recipe added to the list: Supermarket");
        expect(dialogRef.close).toHaveBeenCalledWith(merged);
      });

      it("stays open, ready to try again, when the server refuses", async () => {
        await create();
        service.importShoppingListRecipe.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
        await preview();

        await submit();

        expect(dialogRef.close).not.toHaveBeenCalled();
        expect(el("recipe-import-adding")).toBeNull();
        expect(submitDisabled()).toBe(false);
      });
    });
  });

  it("closes without adding anything on Cancel", async () => {
    await create();

    await click(fixture.nativeElement.querySelector("app-cancel-button button"));

    expect(dialogRef.close).toHaveBeenCalledWith();
    expect(service.importShoppingListRecipe).not.toHaveBeenCalled();
  });
});
