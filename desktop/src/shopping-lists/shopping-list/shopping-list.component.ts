import { HttpErrorResponse } from "@angular/common/http";
import { Component, computed, ElementRef, inject, input, signal, ChangeDetectionStrategy } from "@angular/core";
import { FormBuilder, FormControl, FormGroup } from "@angular/forms";
import { AppDialog } from "../../dialog/app-dialog";
import { Store } from "@ngxs/store";
import { EMPTY, filter, from, map, of, switchMap, take } from "rxjs";
import { ShoppingList, ShoppingListItem, ShoppingListService } from "../../open-api";
import { SnackbarService } from "../../services";
import { ShoppingListSyncService } from "../../services/shopping-list-sync.service";
import { shakeInvalid } from "../../utils/shake";
import { ConfirmationDialogComponent } from "../../shared-ui/confirmation-dialog/confirmation-dialog.component";
import { AuthState } from "../../store/auth.state";
import { ShoppingListEventType, ShoppingListState } from "../../store/shopping-list.state";
import {
  ApplyShoppingListEvent,
  DiscardLocalShoppingListItem,
  QueueShoppingListChange,
} from "../../store/shopping-list.state.actions";
import { isLocalItem, newClientId, nextLocalItemId } from "../shopping-list-pending";
import { ShoppingListItemFormDialogComponent } from "../shopping-list-item-form-dialog/shopping-list-item-form-dialog.component";
import { ShoppingListItemClassification } from "../shopping-list-item/shopping-list-item.component";
import {
  buildShoppingListItemForm,
  DEFAULT_SHOPPING_LIST_UNIT,
  toUpsertShoppingListItemCommand,
} from "../shopping-list-item-form";

import { buildItemSuggestions, ItemSuggestion } from "../shopping-item-suggestions";
import { TranslationService } from "../../i18n/translation.service";
import { marker } from "../../i18n/marker";

const OFFLINE_MESSAGE = "Couldn't reach the server. Check your connection and try again.";

/** The selected list: a quick-add bar, the items still to buy, and the crossed-off ones. */
@Component({
  selector: "app-shopping-list",
  templateUrl: "./shopping-list.component.html",
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class ShoppingListComponent {
  private readonly translation = inject(TranslationService);

  public readonly list = input.required<ShoppingList>();

  public readonly groupId = input.required<number>();

  public readonly canUpdate = input<boolean>(false);

  public readonly activeItems = this.store.selectSignal(ShoppingListState.activeItems);

  public readonly checkedItems = this.store.selectSignal(ShoppingListState.checkedItems);

  public readonly showCrossedOff = signal(false);

  /** The rows with a change the server has not confirmed yet. */
  public readonly pendingItemIds = this.store.selectSignal(ShoppingListState.pendingItemIds);

  public readonly addForm: FormGroup;

  private readonly allLists = this.store.selectSignal(ShoppingListState.lists);

  /** Items the household added before (any list, open or crossed off), offered as the name is typed. */
  public readonly suggestions = computed(() => buildItemSuggestions(this.allLists(), this.list().id));

  public get nameControl(): FormControl<string | null> {
    return this.addForm.get("name") as FormControl<string | null>;
  }

  private readonly host = inject(ElementRef<HTMLElement>);

  private readonly sync = inject(ShoppingListSyncService);

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

  /**
   * Adding and crossing off are what a person does in the shop, where the phone loses its signal between the
   * shelves: both show at once and go into the queue (`QueueShoppingListChange`), which `ShoppingListSyncService`
   * sends when the server can be reached. The row carries a negative id and a client id until the server's item
   * takes its place; a name that matches a crossed-off item comes back as that item then.
   */
  public addItem(): void {
    const command = toUpsertShoppingListItemCommand(this.addForm);
    // An item needs a name: an empty add box shakes and lights up instead of doing nothing.
    if (command.name.length === 0) {
      shakeInvalid(this.host.nativeElement.querySelector(".add-name"));
      return;
    }

    if (this.addForm.invalid) {
      return;
    }

    const clientId = newClientId();
    const now = new Date().toISOString();
    const item: ShoppingListItem = {
      id: nextLocalItemId(),
      clientId,
      shoppingListId: this.list().id,
      name: command.name,
      amount: command.amount ?? undefined,
      unit: command.unit ?? "",
      quantity: command.quantity ?? "",
      note: command.note ?? "",
      isChecked: false,
      createdAt: now,
      updatedAt: now,
      health: "",
      foodGroup: "",
      seasonality: "",
      classificationOverridden: false,
    };

    this.store.dispatch(
      new QueueShoppingListChange({
        kind: "add",
        opId: clientId,
        groupId: this.groupId(),
        listId: this.list().id,
        clientId,
        item,
        command,
      })
    );
    this.addForm.reset({ name: "", amount: "", unit: DEFAULT_SHOPPING_LIST_UNIT, note: "" });
  }

  /** Crossed off (or put back) at once and queued; see `addItem`. */
  public toggleItem(item: ShoppingListItem): void {
    const isChecked = !item.isChecked;
    if (isChecked) {
      // A short tick under the thumb (Android; iOS has no Vibration API, so this is a no-op there).
      navigator.vibrate?.(10);
    }

    this.store.dispatch(
      new QueueShoppingListChange({
        kind: "toggle",
        opId: newClientId(),
        groupId: this.groupId(),
        listId: item.shoppingListId,
        itemId: item.id,
        clientId: isLocalItem(item) ? item.clientId : undefined,
        isChecked,
        checkedAt: isChecked ? new Date().toISOString() : undefined,
        checkedByUserId: isChecked ? Number(this.store.selectSnapshot(AuthState.userId)) || undefined : undefined,
      })
    );
  }

  public editItem(item: ShoppingListItem): void {
    const dialogRef = this.matDialog.open(ShoppingListItemFormDialogComponent);
    dialogRef.componentInstance.groupId = this.groupId();
    dialogRef.componentInstance.item = item;
  }

  public deleteItem(item: ShoppingListItem): void {
    const confirmed = this.confirm(marker("Delete Item"), this.translation.t("Delete \"{name}\" from this list?", { name: item.name }), marker("Delete"));

    // A row the server has not seen yet is simply taken back, with whatever was waiting for it.
    if (isLocalItem(item) && item.clientId) {
      const clientId = item.clientId;
      confirmed.subscribe(() => this.store.dispatch(new DiscardLocalShoppingListItem(clientId)));
      return;
    }

    confirmed
      .pipe(switchMap(() => this.shoppingListService.deleteShoppingListItem(item.id)))
      .subscribe({
        next: () => this.applyItem(ShoppingListEventType.ItemDeleted, item),
        error: (error: HttpErrorResponse) => this.reportIfOffline(error),
      });
  }

  /**
   * Clears what the server has as crossed off, so this device's waiting cross-offs are sent first (otherwise a row
   * would vanish here and come back crossed off). When they cannot be sent, nothing is cleared.
   */
  public clearCrossedOff(): void {
    const count = this.checkedItems().length;
    this.confirm(marker("Clear Crossed Off"), this.translation.t("Remove all {count} crossed-off items from this list?", { count }), marker("Remove"))
      .pipe(
        switchMap(() => (this.pendingItemIds().size > 0 ? from(this.sync.drained()) : of(true))),
        switchMap((sent) => {
          if (!sent) {
            this.snackbarService.error(OFFLINE_MESSAGE);
            return EMPTY;
          }
          // Read after the queue went out: a row added a moment ago has the server's id by now.
          const itemIds = this.checkedItems().map((item) => item.id);
          return this.shoppingListService.clearCheckedShoppingListItems(this.list().id).pipe(map(() => itemIds));
        })
      )
      .subscribe({
        next: (itemIds) =>
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

  private confirm(headerText: string, dialogContent: string, confirmText: string) {
    const dialogRef = this.matDialog.open(ConfirmationDialogComponent);
    dialogRef.componentInstance.headerText = headerText;
    dialogRef.componentInstance.dialogContent = dialogContent;
    dialogRef.componentInstance.confirmText = confirmText;

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
