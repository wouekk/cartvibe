import { HlmDropdownMenuImports } from "@spartan-ng/helm/dropdown-menu";
import { CommonModule, CurrencyPipe } from "@angular/common";
import { Component, computed, DestroyRef, effect, inject, input, signal, untracked, WritableSignal, ChangeDetectionStrategy } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { HlmButton } from "@spartan-ng/helm/button";
import { AppIconComponent } from "../../shared-ui/icon/icon.component";
import { AppDialog } from "../../dialog/app-dialog";
import { Store } from "@ngxs/store";
import { catchError, concatMap, EMPTY, filter, Subject, Subscription, switchMap, take, timer } from "rxjs";
import { Category, Permission, ReceiptProduct, ReceiptProductService, ReceiptProductsView, Tag, UpsertReceiptProductCommand } from "../../open-api";
import { ConfirmationDialogComponent } from "../../shared-ui/confirmation-dialog/confirmation-dialog.component";
import { PipesModule } from "../../pipes/pipes.module";
import { FoodTagsComponent } from "../../standalone/components/food-tags/food-tags.component";
import { HEALTH_CHOICES } from "../../standalone/components/food-tags/food-tags";
import { AuthState } from "../../store";
import { hasAll } from "../../utils/permission.utils";
import { parseAmountInput } from "./product-amount";
import { marker } from "../../i18n/marker";
import { TranslationService } from "../../i18n/translation.service";

/** While a read is queued or running, the section checks back this often. */
const REFRESH_INTERVAL_MS = 30_000;

/** And at most this many times, so an abandoned tab stops asking. */
const MAX_REFRESHES = 20;

const byName = <T extends { name?: string }>(rows: T[]): T[] => [...rows].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));

const toggled = (ids: number[], id: number): number[] => (ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id]);

const STATUS_TEXT: { [status: string]: string } = {
  NOT_QUEUED: marker("Products are read from the receipt's image. This receipt has none yet."),
  PENDING: marker("Waiting to be read by the AI. This usually takes a few minutes."),
  RUNNING: marker("The AI is reading this receipt now."),
  UNAVAILABLE: marker("The AI could not be reached. It will try again automatically."),
  FAILED: marker("The AI could not read the products on this receipt."),
};

/**
 * The products the AI read off a receipt. Self-contained: it loads its own data by receipt id and
 * checks back while a read is in progress. Status values are plain strings on the API, so an
 * unknown one simply shows no explanation.
 */
@Component({
  selector: "app-receipt-products",
  host: { class: "block" },
  templateUrl: "./receipt-products.component.html",
  standalone: true,
  imports: [CommonModule, FoodTagsComponent, HlmButton, AppIconComponent, ...HlmDropdownMenuImports, PipesModule],
  // customCurrency delegates to CurrencyPipe, which PipesModule does not provide.
  changeDetection: ChangeDetectionStrategy.Eager,
  providers: [CurrencyPipe],
})
export class ReceiptProductsComponent {
  private readonly translation = inject(TranslationService);

  public readonly receiptId = input.required<number>();

  public readonly groupId = input.required<number>();

  public readonly view = signal<ReceiptProductsView | undefined>(undefined);

  public readonly loadFailed = signal(false);

  public readonly requesting = signal(false);

  public readonly statusText = computed(() => {
    const view = this.view();
    if (!view || view.status === "DONE") {
      return "";
    }
    return STATUS_TEXT[view.status] ?? "";
  });

  public readonly isInProgress = computed(() => ["PENDING", "RUNNING"].includes(this.view()?.status ?? ""));

  private readonly groupPermissions = this.store.selectSignal(AuthState.groupPermissions);

  /** Reading again and correcting tags both need update: they change the group's data. */
  public readonly canUpdate = computed(() =>
    hasAll(this.groupPermissions()[this.groupId()] ?? [], Permission.GroupReceiptsUpdate)
  );

  /** Reading again also spends AI credits on the group's behalf. */
  public readonly canReadAgain = computed(() => {
    const status = this.view()?.status;
    return (status === "DONE" || status === "FAILED" || status === "UNAVAILABLE") && this.canUpdate();
  });

  /** The product row being edited in place, if any (Phase 3 C5). */
  public readonly editingId = signal<number | null>(null);

  public readonly draftName = signal("");

  public readonly draftAmount = signal("");

  public readonly draftQuantity = signal("");

  /** The one-line "add a product" row. */
  public readonly newName = signal("");

  public readonly newAmount = signal("");

  public readonly newQuantity = signal("");

  /** The add row's category and tags, picked before the line exists. */
  public readonly newCategoryId = signal<number | null>(null);

  public readonly newTagIds = signal<number[]>([]);

  public readonly formError = signal("");

  public readonly saving = signal(false);

  /**
   * Category and tag picks, saved one at a time in the order made. A pick shows on the line at once (the
   * tag menu stays open for several ticks); the server's answer replaces the line only once no later pick
   * for it is still on its way, and a failed save reloads the list.
   */
  private readonly labelSaves = new Subject<{ productId: number; categoryId: number | null; tagIds: number[] }>();

  private readonly pendingLabelSaves = new Map<number, number>();

  /**
   * What the pickers offer: the group's categories and tags (the ones the caller may use), by name. They
   * follow the store, so one added under Manage shows up without reloading.
   */
  private readonly catalog = this.store.selectSignal(AuthState.groupCatalog);

  public readonly categoryChoices = computed<Category[]>(() => byName(this.catalog().categories[this.groupId()] ?? []));

  public readonly tagChoices = computed<Tag[]>(() => byName(this.catalog().tags[this.groupId()] ?? []));

  private readonly matDialog = inject(AppDialog);

  /** A category's name; the line's own copy of it when the category is not among the choices. */
  public categoryName(categoryId: number | null | undefined, fallback = ""): string {
    if (categoryId === null || categoryId === undefined) {
      return "";
    }
    return this.categoryChoices().find((category) => category.id === categoryId)?.name ?? fallback;
  }

  public tagName(tagId: number): string {
    return this.tagChoices().find((tag) => tag.id === tagId)?.name ?? "";
  }

  public tagIdsOf(product: ReceiptProduct): number[] {
    return (product.tags ?? []).map((tag) => tag.id as number);
  }

  /** Picks a line's category; without a line, the add row's. null is Uncategorized. */
  public setCategory(product: ReceiptProduct | undefined, categoryId: number | null): void {
    if (!product) {
      this.newCategoryId.set(categoryId);
      return;
    }
    const current = this.currentProduct(product.id);
    if (!current || (current.categoryId ?? null) === categoryId) {
      return;
    }
    this.saveLabels(current, categoryId, this.tagIdsOf(current));
  }

  /** Adds or removes one tag on a line; without a line, on the add row. */
  public toggleTag(product: ReceiptProduct | undefined, tagId: number): void {
    if (!product) {
      this.newTagIds.set(toggled(this.newTagIds(), tagId));
      return;
    }
    // The menu holds the line as it was when it opened; earlier ticks have changed it since.
    const current = this.currentProduct(product.id);
    if (current) {
      this.saveLabels(current, current.categoryId ?? null, toggled(this.tagIdsOf(current), tagId));
    }
  }

  private currentProduct(productId: number): ReceiptProduct | undefined {
    return this.view()?.products.find((candidate) => candidate.id === productId);
  }

  private saveLabels(product: ReceiptProduct, categoryId: number | null, tagIds: number[]): void {
    const shown: ReceiptProduct = {
      ...product,
      categoryId: categoryId ?? undefined,
      foodGroup: this.categoryName(categoryId),
      tags: tagIds.map((id) => this.tagChoices().find((tag) => tag.id === id) ?? { id, name: "" }),
    };
    this.replaceProducts((products) => products.map((candidate) => (candidate.id === product.id ? shown : candidate)));

    this.pendingLabelSaves.set(product.id, (this.pendingLabelSaves.get(product.id) ?? 0) + 1);
    this.labelSaves.next({ productId: product.id, categoryId, tagIds });
  }

  private watchLabelSaves(): void {
    this.labelSaves
      .pipe(
        concatMap(({ productId, categoryId, tagIds }) =>
          this.receiptProductService.setReceiptProductLabels(productId, { categoryId: categoryId ?? undefined, tagIds }).pipe(
            catchError(() => {
              this.pendingLabelSaves.clear();
              this.load(this.receiptId());
              return EMPTY;
            })
          )
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((updated) => {
        const left = (this.pendingLabelSaves.get(updated.id) ?? 1) - 1;
        if (left > 0) {
          this.pendingLabelSaves.set(updated.id, left);
          return;
        }
        this.pendingLabelSaves.delete(updated.id);
        this.replaceProducts((products) => products.map((candidate) => (candidate.id === updated.id ? updated : candidate)));
      });
  }

  public setValue(target: WritableSignal<string>, event: Event): void {
    target.set((event.target as HTMLInputElement).value);
  }

  public startEdit(product: ReceiptProduct): void {
    this.formError.set("");
    this.editingId.set(product.id);
    this.draftName.set(product.displayName || product.name);
    this.draftAmount.set(product.amount ?? "");
    this.draftQuantity.set(product.quantity ?? "");
  }

  public cancelEdit(): void {
    this.editingId.set(null);
    this.formError.set("");
  }

  public saveEdit(product: ReceiptProduct): void {
    // The update replaces the category and tags too, so it carries the line's current ones.
    const command = this.buildCommand(this.draftName(), this.draftAmount(), this.draftQuantity(), product.categoryId ?? null, this.tagIdsOf(product));
    if (!command) {
      return;
    }

    this.saving.set(true);
    this.receiptProductService
      .updateReceiptProduct(product.id, command)
      .pipe(take(1))
      .subscribe({
        next: (updated) => {
          this.replaceProducts((products) => products.map((candidate) => (candidate.id === updated.id ? updated : candidate)));
          this.editingId.set(null);
          this.saving.set(false);
        },
        error: () => this.saving.set(false),
      });
  }

  public addProduct(): void {
    const command = this.buildCommand(this.newName(), this.newAmount(), this.newQuantity(), this.newCategoryId(), this.newTagIds());
    if (!command) {
      return;
    }

    this.saving.set(true);
    this.receiptProductService
      .addReceiptProduct(this.receiptId(), command)
      .pipe(take(1))
      .subscribe({
        next: (added) => {
          this.replaceProducts((products) => [...products, added]);
          this.newName.set("");
          this.newAmount.set("");
          this.newQuantity.set("");
          this.newCategoryId.set(null);
          this.newTagIds.set([]);
          this.saving.set(false);
        },
        error: () => this.saving.set(false),
      });
  }

  public remove(product: ReceiptProduct): void {
    const dialogRef = this.matDialog.open(ConfirmationDialogComponent);
    dialogRef.componentInstance.headerText = marker("Remove product");
    dialogRef.componentInstance.dialogContent = this.translation.t("Remove \"{name}\" from this receipt?", { name: product.displayName || product.name });

    dialogRef
      .afterClosed()
      .pipe(
        take(1),
        // Truthiness, not === true: a backdrop click or ESC closes with undefined.
        filter((confirmed) => !!confirmed),
        switchMap(() => this.receiptProductService.deleteReceiptProduct(product.id))
      )
      .subscribe(() => this.replaceProducts((products) => products.filter((candidate) => candidate.id !== product.id)));
  }

  private buildCommand(
    name: string,
    amountText: string,
    quantity: string,
    categoryId: number | null,
    tagIds: number[]
  ): UpsertReceiptProductCommand | undefined {
    const trimmedName = name.trim();
    const amount = parseAmountInput(amountText);

    if (trimmedName.length === 0) {
      this.formError.set("A product needs a name.");
      return undefined;
    }
    if (!amount.ok) {
      this.formError.set(marker("The amount must be a number with at most two decimals, like 1,99."));
      return undefined;
    }

    this.formError.set("");
    return { name: trimmedName, amount: amount.value, quantity: quantity.trim(), categoryId: categoryId ?? undefined, tagIds };
  }

  private replaceProducts(change: (products: ReceiptProduct[]) => ReceiptProduct[]): void {
    const view = this.view();
    if (view) {
      this.view.set({ ...view, products: change(view.products) });
    }
  }
  protected readonly healthChoices = HEALTH_CHOICES;

  private refreshes = 0;

  private refreshSubscription?: Subscription;

  private readonly destroyRef = inject(DestroyRef);

  constructor(
    private receiptProductService: ReceiptProductService,
    private store: Store
  ) {
    this.watchLabelSaves();
    effect(() => {
      const receiptId = this.receiptId();
      untracked(() => {
        this.refreshes = 0;
        this.load(receiptId);
      });
    });
  }

  public readAgain(): void {
    this.requesting.set(true);
    this.receiptProductService
      .readReceiptProducts(this.receiptId())
      .pipe(take(1))
      .subscribe({
        next: (view) => {
          this.refreshes = 0;
          this.show(view);
          this.requesting.set(false);
        },
        error: () => this.requesting.set(false),
      });
  }

  /** A person's correction of a product's health; the server remembers it for the group. */
  public correct(product: ReceiptProduct, health: string): void {
    this.receiptProductService
      .setReceiptProductClassification(product.id, { health })
      .pipe(take(1))
      .subscribe((updated) => {
        const view = this.view();
        if (view) {
          this.view.set({
            ...view,
            products: view.products.map((candidate) => (candidate.id === updated.id ? updated : candidate)),
          });
        }
      });
  }

  private load(receiptId: number): void {
    this.receiptProductService
      .getReceiptProducts(receiptId)
      .pipe(
        take(1),
        catchError(() => {
          this.loadFailed.set(true);
          return EMPTY;
        })
      )
      .subscribe((view) => this.show(view));
  }

  private show(view: ReceiptProductsView): void {
    this.loadFailed.set(false);
    this.view.set(view);
    this.scheduleRefresh();
  }

  private scheduleRefresh(): void {
    this.refreshSubscription?.unsubscribe();
    if (!this.isInProgress() || this.refreshes >= MAX_REFRESHES) {
      return;
    }

    this.refreshes++;
    this.refreshSubscription = timer(REFRESH_INTERVAL_MS)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.load(this.receiptId()));
  }
}
