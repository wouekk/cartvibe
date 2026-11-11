import { HttpErrorResponse } from "@angular/common/http";
import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormControl, FormGroup, ReactiveFormsModule } from "@angular/forms";
import { Store } from "@ngxs/store";
import { take } from "rxjs";
import { APP_DIALOG_DATA, AppDialogRef } from "../../dialog/app-dialog";
import { marker } from "../../i18n/marker";
import { TranslationService } from "../../i18n/translation.service";
import { RecipePreview, ShoppingList, ShoppingListService } from "../../open-api";
import { SnackbarService } from "../../services";
import { FilterTab } from "../../shared-ui/filter-bar/filter-tab.interface";
import { ShoppingListEventType } from "../../store/shopping-list.state";
import { ApplyShoppingListEvent } from "../../store/shopping-list.state.actions";
import {
  RECIPE_MULTIPLIERS,
  formatQuantity,
  isHttpUrl,
  normalizeItemName,
  openItemNames,
  parseQuantity,
  scaleQuantity,
  servingsMultiplier,
} from "./recipe-scaling";
import { DialogComponent } from "../../shared-ui/dialog/dialog.component";
import { SettingsTabsComponent } from "../../shared-ui/settings/settings-tabs.component";
import { AppIconComponent } from "../../shared-ui/icon/icon.component";
import { InputComponent } from "../../input/input/input.component";
import { TextareaComponent } from "../../textarea/textarea/textarea.component";
import { SelectComponent } from "../../select/select/select.component";
import { DialogFooterComponent } from "../../shared-ui/dialog-footer/dialog-footer.component";
import { BrnButton } from "@spartan-ng/brain/button";
import { HlmButton } from "../../ui/button/lib/hlm-button";
import { BrnFieldControlDescribedBy } from "@spartan-ng/brain/field";
import { HlmCheckbox } from "../../ui/checkbox/lib/hlm-checkbox";
import { BadgeComponent } from "../../shared-ui/badge/badge.component";
import { HlmSpinner } from "../../ui/spinner/lib/hlm-spinner";
import { TranslatePipe, PluralPipe } from "../../i18n/translate.pipe";

/** What the page hands the dialog. */
export interface RecipeImportDialogData {
  groupId: number;
  /** The group's lists; `listId` is the one the recipe goes to unless the person picks another. */
  lists: ShoppingList[];
  listId: number;
  /** Set when the dialog was opened from a phone's share sheet: it asks which list to add to. */
  askForList?: boolean;
  /** A link or pasted text carried in by the share sheet. */
  url?: string;
  text?: string;
}

type Mode = "url" | "text";
type Step = "input" | "preview";

/** One parsed ingredient, with its immutable base quantity. What is shown and sent is derived from the multiplier. */
interface PreviewRow {
  index: number;
  name: string;
  unit: string;
  baseQuantity: number | null;
}

/** The most servings the stepper goes to. */
const MAX_SERVINGS = 99;

/** The guidance for a page that could not be read, keyed by the API's failureReason (an open string). */
const FAILURE_HINTS: Record<string, string> = {
  blocked: marker("That site does not allow its recipes to be read automatically. Select the ingredients on the page, copy them and paste them here."),
  timeout: marker("That site took too long to answer. Copy the ingredients from the page and paste them here."),
  unreachable: marker("That page could not be reached. Check the link, or copy the ingredients from the page and paste them here."),
  not_found: marker("That page was not found. Check the link, or copy the ingredients from the page and paste them here."),
  not_html: marker("That link is not a web page. Copy the ingredients from the page and paste them here."),
  too_large: marker("That page is too large to read. Copy the ingredients from the page and paste them here."),
  invalid_url: marker("That does not look like a web address. Check the link, or paste the ingredients here."),
  no_recipe: marker("No recipe was found on that page. Copy the ingredients from the page and paste them here."),
  busy: marker("Too many recipes are being read right now. Try again in a moment, or paste the ingredients here."),
  no_ingredients: marker("No ingredients were found in that text. Put each ingredient on its own line, like “200 g flour”."),
};

const ADD_ONE_ITEM = marker("Add 1 item");
const ADD_ITEMS = marker("Add {count} items");

const GENERIC_FAILURE_HINT = marker("The recipe could not be read. Copy the ingredients from the page and paste them here.");

@Component({
    selector: "app-recipe-import-dialog",
    templateUrl: "./recipe-import-dialog.component.html",
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [
        DialogComponent,
        ReactiveFormsModule,
        SettingsTabsComponent,
        AppIconComponent,
        InputComponent,
        TextareaComponent,
        SelectComponent,
        DialogFooterComponent,
        BrnButton,
        HlmButton,
        BrnFieldControlDescribedBy,
        HlmCheckbox,
        BadgeComponent,
        HlmSpinner,
        TranslatePipe,
        PluralPipe,
    ],
})
export class RecipeImportDialogComponent {
  private readonly dialogRef = inject<AppDialogRef<RecipeImportDialogComponent, ShoppingList>>(AppDialogRef);
  private readonly shoppingListService = inject(ShoppingListService);
  private readonly store = inject(Store);
  private readonly snackbarService = inject(SnackbarService);
  private readonly translation = inject(TranslationService);

  protected readonly data = inject<RecipeImportDialogData>(APP_DIALOG_DATA);

  protected readonly multiplierTabs: FilterTab[] = RECIPE_MULTIPLIERS.map((value) => ({
    value: String(value),
    label: `${value}×`,
    testId: `recipe-multiplier-${value}`,
  }));

  protected readonly onListText = marker("On list");

  protected readonly modeTabs: FilterTab[] = [
    { value: "url", label: marker("Recipe URL"), icon: "link", testId: "recipe-import-mode-url" },
    { value: "text", label: marker("Paste ingredients"), icon: "description", testId: "recipe-import-mode-text" },
  ];

  protected readonly mode = signal<Mode>(this.data.url || !this.data.text ? "url" : "text");
  protected readonly step = signal<Step>("input");
  protected readonly loading = signal(false);
  protected readonly importing = signal(false);

  /** Guidance shown above the fields: why a page could not be read, or what to fix in the pasted text. */
  protected readonly hint = signal<string | undefined>(undefined);

  protected readonly urlControl = new FormControl<string>(this.data.url ?? "", { nonNullable: true });
  protected readonly textControl = new FormControl<string>(this.data.text ?? "", { nonNullable: true });
  protected readonly listControl = new FormControl<number>(this.data.listId, { nonNullable: true });

  /** Gives the input step a real form: Enter submits it, and `ngSubmit` only exists on a form directive. */
  protected readonly inputForm = new FormGroup({ url: this.urlControl, text: this.textControl });

  // Form controls are not signals, so what the template needs to react to is mirrored here.
  private readonly urlValue = signal(this.urlControl.value);
  private readonly textValue = signal(this.textControl.value);

  protected readonly canPreview = computed(() =>
    this.mode() === "url" ? isHttpUrl(withScheme(this.urlValue())) : this.textValue().trim().length > 0
  );

  protected readonly preview = signal<RecipePreview | undefined>(undefined);

  protected readonly rows = computed<PreviewRow[]>(() =>
    (this.preview()?.items ?? []).map((item, index) => ({
      index,
      name: item.name,
      unit: item.unit ?? "",
      baseQuantity: parseQuantity(item.quantity),
    }))
  );

  /** The recipe's own servings, when the page gave them. */
  protected readonly baseServings = computed(() => this.preview()?.servings ?? undefined);

  protected readonly multiplier = signal(1);

  /** The active multiplier pill; empty when the servings stepper has moved to one that is not a pill. */
  protected readonly multiplierValue = computed(() => {
    const active = RECIPE_MULTIPLIERS.find((value) => Math.abs(this.multiplier() - value) < 1e-9);
    return active === undefined ? "" : String(active);
  });

  protected readonly targetServings = computed(() => {
    const base = this.baseServings();
    return base === undefined ? undefined : Math.max(1, Math.round(base * this.multiplier()));
  });

  /** Ticked rows by index; every row starts ticked so pantry staples are un-ticked rather than the rest ticked. */
  protected readonly checked = signal<ReadonlySet<number>>(new Set());

  /** Names still to buy on the target list, so a row can say "On list". */
  private readonly openNames = signal<Set<string>>(openItemNames(this.listItems(this.data.listId)));

  protected readonly displayRows = computed(() =>
    this.rows().map((row) => {
      const scaled = scaleQuantity(row.baseQuantity, this.multiplier());
      return {
        ...row,
        scaled,
        quantityText: formatQuantity(scaled),
        checked: this.checked().has(row.index),
        onList: this.openNames().has(normalizeItemName(row.name)),
      };
    })
  );

  protected readonly selectedCount = computed(() => this.displayRows().filter((row) => row.checked).length);

  protected readonly submitText = computed(() =>
    this.translation.t(this.selectedCount() === 1 ? ADD_ONE_ITEM : ADD_ITEMS, { count: this.selectedCount() })
  );

  protected readonly listOptions = computed(() => this.data.lists);

  constructor() {
    this.urlControl.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => this.urlValue.set(value));
    this.textControl.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => this.textValue.set(value));
    this.listControl.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((listId) => this.openNames.set(openItemNames(this.listItems(listId))));
  }

  private listItems(listId: number) {
    return this.data.lists.find((list) => list.id === listId)?.items ?? [];
  }

  protected setMode(value: string): void {
    this.mode.set(value === "text" ? "text" : "url");
    this.hint.set(undefined);
  }

  /** Reads the link or the pasted text and moves on to the preview, or says why it cannot. */
  protected loadPreview(): void {
    if (!this.canPreview() || this.loading()) {
      return;
    }

    const url = this.mode() === "url";
    const command = url
      ? { url: withScheme(this.urlControl.value) }
      : { text: this.textControl.value };

    this.loading.set(true);
    this.hint.set(undefined);
    this.shoppingListService
      .previewShoppingListRecipe(this.data.groupId, command)
      .pipe(take(1))
      .subscribe({
        next: (preview) => {
          this.loading.set(false);
          this.showPreview(preview, url);
        },
        error: (error: unknown) => {
          this.loading.set(false);
          // The interceptor toasts the error; a rate limit also deserves guidance next to the field.
          if (error instanceof HttpErrorResponse && (error.status === 429 || error.status === 503)) {
            this.hint.set(FAILURE_HINTS["busy"]);
          }
        },
      });
  }

  private showPreview(preview: RecipePreview, fromUrl: boolean): void {
    const items = preview.items ?? [];
    if (preview.failureReason || items.length === 0) {
      // A page that cannot be read hands over to the paste tab; pasted text that yields nothing stays where it is.
      this.hint.set(FAILURE_HINTS[preview.failureReason || "no_ingredients"] ?? GENERIC_FAILURE_HINT);
      if (fromUrl) {
        this.mode.set("text");
      }
      return;
    }

    this.preview.set(preview);
    this.multiplier.set(1);
    this.checked.set(new Set(items.map((_, index) => index)));
    this.step.set("preview");
  }

  protected backToInput(): void {
    this.step.set("input");
    this.hint.set(undefined);
  }

  protected setMultiplier(value: string): void {
    const multiplier = Number(value);
    if (Number.isFinite(multiplier) && multiplier > 0) {
      this.multiplier.set(multiplier);
    }
  }

  protected changeServings(delta: number): void {
    const base = this.baseServings();
    const current = this.targetServings();
    if (base === undefined || current === undefined) {
      return;
    }

    const target = Math.min(MAX_SERVINGS, Math.max(1, current + delta));
    this.multiplier.set(servingsMultiplier(target, base));
  }

  protected toggle(index: number, isChecked: boolean): void {
    const next = new Set(this.checked());
    if (isChecked) {
      next.add(index);
    } else {
      next.delete(index);
    }
    this.checked.set(next);
  }

  /** Adds the ticked rows, at their scaled quantities, to the chosen list in one request. */
  protected addSelected(): void {
    const listId = this.listControl.value;
    const items = this.displayRows()
      .filter((row) => row.checked)
      .map((row) => ({
        name: row.name,
        ...(row.scaled === null ? {} : { amount: formatQuantity(row.scaled), unit: row.unit }),
      }));
    if (items.length === 0 || this.importing()) {
      return;
    }

    this.importing.set(true);
    this.shoppingListService
      .importShoppingListRecipe(listId, { items })
      .pipe(take(1))
      .subscribe({
        next: (result) => {
          this.store.dispatch(
            new ApplyShoppingListEvent({
              type: ShoppingListEventType.ListUpdated,
              groupId: result.list.groupId,
              shoppingListId: result.list.id,
              list: result.list,
            })
          );
          this.snackbarService.success(
            this.translation.t("Recipe added to the list: {name}", { name: result.list.name })
          );
          this.importing.set(false);
          this.dialogRef.close(result.list);
        },
        // The interceptor toasts the refusal.
        error: () => this.importing.set(false),
      });
  }

  protected close(): void {
    this.dialogRef.close();
  }
}

/** A link typed without its scheme ("allrecipes.com/x") is taken to be https. */
function withScheme(value: string): string {
  const trimmed = value.trim();
  return trimmed && !/^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? `https://${trimmed}` : trimmed;
}
