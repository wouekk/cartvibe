import { HttpErrorResponse } from "@angular/common/http";
import { Component, computed, ElementRef, inject, input, signal } from "@angular/core";
import { FormBuilder, FormControl, FormGroup } from "@angular/forms";
import { AppDialog } from "../../dialog/app-dialog";
import { Store } from "@ngxs/store";
import { filter, switchMap, take } from "rxjs";
import { ShoppingList, ShoppingListItem, ShoppingListService } from "../../open-api";
import { SnackbarService } from "../../services";
import { shakeInvalid } from "../../utils/shake";
import { ConfirmationDialogComponent } from "../../shared-ui/confirmation-dialog/confirmation-dialog.component";
import { ShoppingListEventType, ShoppingListState } from "../../store/shopping-list.state";
import { ApplyShoppingListEvent } from "../../store/shopping-list.state.actions";
import { ShoppingListItemFormDialogComponent } from "../shopping-list-item-form-dialog/shopping-list-item-form-dialog.component";
import { ShoppingListItemClassification } from "../shopping-list-item/shopping-list-item.component";
import {
  buildShoppingListItemForm,
  DEFAULT_SHOPPING_LIST_UNIT,
  toUpsertShoppingListItemCommand,
} from "../shopping-list-item-form";

import { buildItemSuggestions, ItemSuggestion } from "../shopping-item-suggestions";

const OFFLINE_MESSAGE = "Couldn't reach the server. Check your connection and try again.";

/** The selected list: a quick-add bar, the items still to buy, and the crossed-off ones. */
@Component({
  selector: "app-shopping-list",
  templateUrl: "./shopping-list.component.html",
  standalone: false,
})
export class ShoppingListComponent {
  public readonly list = input.required<ShoppingList>();

  public readonly groupId = input.required<number>();

  public readonly canUpdate = input<boolean>(false);

  public readonly activeItems = this.store.selectSignal(ShoppingListState.activeItems);

  public readonly checkedItems = this.store.selectSignal(ShoppingListState.checkedItems);

  public readonly showCrossedOff = signal(false);

  public readonly adding = signal(false);

  public readonly addForm: FormGroup;

  private readonly allLists = this.store.selectSignal(ShoppingListState.lists);

  /** Items the household added before (any list, open or crossed off), offered as the name is typed. */
  public readonly suggestions = computed(() => buildItemSuggestions(this.allLists(), this.list().id));

  public get nameControl(): FormControl<string | null> {
    return this.addForm.get("name") as FormControl<string | null>;
  }

  private readonly host = inject(ElementRef<HTMLElement>);

  constructor(
    private store: Store,
    private formBuilder: FormBuilder,
    private shoppingListService: ShoppingListService,
    private matDialog: AppDialog,
    private snackbarService: SnackbarService
  ) {
    this.addForm = buildShoppingListItemForm(this.formBuilder);
  }

  /** A suggestion was picked: its last amount and unit come along, unless the user already typed an amount. */
  public suggestionPicked(suggestion: ItemSuggestion): void {
    const amount = this.addForm.get("amount");
    if (suggestion.amount && !(amount?.value ?? "").toString().trim()) {
      this.addForm.patchValue({ amount: suggestion.amount, unit: suggestion.unit ?? DEFAULT_SHOPPING_LIST_UNIT });
    }
  }

  public addItem(): void {
    const command = toUpsertShoppingListItemCommand(this.addForm);
    // An item needs a name: an empty add box shakes and lights up instead of doing nothing.
    if (command.name.length === 0) {
      shakeInvalid(this.host.nativeElement.querySelector(".add-name"));
      return;
    }

    if (command.name.length === 0 || this.addForm.invalid || this.adding()) {
      return;
    }

    this.adding.set(true);
    this.shoppingListService
      .addShoppingListItem(this.list().id, command)
      .pipe(take(1))
      .subscribe({
        next: (item) => {
          // ITEM_ADDED upserts by id, so it also covers a crossed-off item the server revived.
          this.applyItem(ShoppingListEventType.ItemAdded, item);
          this.addForm.reset({ name: "", amount: "", unit: DEFAULT_SHOPPING_LIST_UNIT, note: "" });
          this.adding.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.reportIfOffline(error);
          this.adding.set(false);
        },
      });
  }

  /**
   * Crossing off is the one action that has to feel instant in a shop, so it is applied
   * optimistically and reverted if the server refuses. Everything else waits for the response.
   */
  public toggleItem(item: ShoppingListItem): void {
    const isChecked = !item.isChecked;
    this.applyItem(ShoppingListEventType.ItemToggled, {
      ...item,
      isChecked,
      checkedAt: isChecked ? new Date().toISOString() : undefined,
    });

    this.shoppingListService
      .setShoppingListItemChecked(item.id, { isChecked })
      .pipe(take(1))
      .subscribe({
        next: (saved) => this.applyItem(ShoppingListEventType.ItemToggled, saved),
        error: (error: HttpErrorResponse) => {
          this.applyItem(ShoppingListEventType.ItemToggled, item);
          this.reportIfOffline(error);
        },
      });
  }

  public editItem(item: ShoppingListItem): void {
    const dialogRef = this.matDialog.open(ShoppingListItemFormDialogComponent);
    dialogRef.componentInstance.groupId = this.groupId();
    dialogRef.componentInstance.item = item;
  }

  public deleteItem(item: ShoppingListItem): void {
    this.confirm("Delete Item", `Delete "${item.name}" from this list?`)
      .pipe(switchMap(() => this.shoppingListService.deleteShoppingListItem(item.id)))
      .subscribe({
        next: () => this.applyItem(ShoppingListEventType.ItemDeleted, item),
        error: (error: HttpErrorResponse) => this.reportIfOffline(error),
      });
  }

  public clearCrossedOff(): void {
    const itemIds = this.checkedItems().map((item) => item.id);
    this.confirm("Clear Crossed Off", `Remove all ${itemIds.length} crossed-off items from this list?`)
      .pipe(switchMap(() => this.shoppingListService.clearCheckedShoppingListItems(this.list().id)))
      .subscribe({
        next: () =>
          this.store.dispatch(
            new ApplyShoppingListEvent({
              type: ShoppingListEventType.CheckedCleared,
              groupId: this.groupId(),
              shoppingListId: this.list().id,
              itemIds,
            })
          ),
        error: (error: HttpErrorResponse) => this.reportIfOffline(error),
      });
  }

  /** A person's correction of an item's tags; the server remembers it for the group's future items. */
  public correctTags(correction: ShoppingListItemClassification): void {
    this.shoppingListService
      .setShoppingListItemClassification(correction.item.id, {
        health: correction.health,
        ...(correction.seasonality ? { seasonality: correction.seasonality } : {}),
      })
      .pipe(take(1))
      .subscribe({
        next: (item) => this.applyItem(ShoppingListEventType.ItemUpdated, item),
        error: (error: HttpErrorResponse) => this.reportIfOffline(error),
      });
  }

  private applyItem(type: string, item: ShoppingListItem): void {
    this.store.dispatch(
      new ApplyShoppingListEvent({ type, groupId: this.groupId(), shoppingListId: item.shoppingListId, item })
    );
  }

  private confirm(headerText: string, dialogContent: string) {
    const dialogRef = this.matDialog.open(ConfirmationDialogComponent);
    dialogRef.componentInstance.headerText = headerText;
    dialogRef.componentInstance.dialogContent = dialogContent;

    // Truthiness, not === true: a backdrop click or ESC closes with undefined.
    return dialogRef.afterClosed().pipe(
      take(1),
      filter((confirmed) => !!confirmed)
    );
  }

  /**
   * The HTTP interceptor already toasts permission denials and server errors; a request that never
   * reached the server (status 0 — a phone losing signal in the shop) is the one it stays silent on.
   */
  private reportIfOffline(error: HttpErrorResponse): void {
    if (error.status === 0) {
      this.snackbarService.error(OFFLINE_MESSAGE);
    }
  }
}
