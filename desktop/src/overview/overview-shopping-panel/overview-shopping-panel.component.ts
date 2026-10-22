import { HttpErrorResponse } from "@angular/common/http";
import { Component, computed, DestroyRef, inject, input, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import { Store } from "@ngxs/store";
import { HlmButton } from "@spartan-ng/helm/button";
import { take } from "rxjs";
import { ButtonModule } from "../../button";
import { marker } from "../../i18n/marker";
import { TranslationService } from "../../i18n/translation.service";
import { TranslatePipe } from "../../i18n/translate.pipe";
import { ShoppingList, ShoppingListItem, ShoppingListService } from "../../open-api";
import { SnackbarService } from "../../services";
import { AppIconComponent } from "../../shared-ui/icon/icon.component";
import { formatShoppingListItemAmount } from "../../shopping-lists/shopping-list-item-form";
import { ShoppingListEventType } from "../../store/shopping-list.state";
import { ApplyShoppingListEvent } from "../../store/shopping-list.state.actions";
import { activeItemsOf, pickLargestList } from "../overview-lists";

/** How many items the panel lists before pointing at the full list. */
export const PANEL_ITEM_LIMIT = 8;

/** How long the Undo row stays after an item is marked done. */
export const UNDO_WINDOW_MS = 6000;

/** The most Undo rows shown at once; marking a fourth item in a row settles the oldest for good. */
export const MAX_UNDO_ROWS = 3;

const OFFLINE_MESSAGE = marker("Couldn't reach the server. Check your connection and try again.");

/** An item marked done a moment ago, still revertable. */
export interface PendingUndo {
  item: ShoppingListItem;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * The Dashboard's shopping panel. It previews the list with the most items still to buy as a bulleted list: tapping
 * an item marks it done and it leaves the list at once, and an Undo row stays for a few seconds in case of a
 * misclick. Marking done is the shopping lists page's own crossing off (the item lands in that list's crossed-off
 * section), so the two always agree.
 *
 * The panel is the host element, so the page can place it with ordinary layout classes.
 */
@Component({
  selector: "section[app-overview-shopping-panel]",
  standalone: true,
  imports: [AppIconComponent, ButtonModule, HlmButton, RouterLink, TranslatePipe],
  templateUrl: "./overview-shopping-panel.component.html",
  host: { class: "cv-panel", "aria-labelledby": "overview-lists-title" },
})
export class OverviewShoppingPanelComponent {
  /** The open lists of the group the panel describes. */
  public readonly lists = input.required<ShoppingList[]>();

  public readonly groupId = input.required<number>();

  /** Crossing items off needs `group.shopping-lists.update`; without it the rows are read-only. */
  public readonly canUpdate = input<boolean>(false);

  public readonly canCreateList = input<boolean>(false);

  /** Where "New list" goes, as the string segments app-button takes. */
  public readonly newListLink = input<string[]>();

  public readonly pending = signal<PendingUndo[]>([]);

  /**
   * The list shown while an Undo row is up. Marking an item done can make another list the largest, and swapping the
   * list under someone's thumb (or under the Undo they are about to press) would be confusing.
   */
  private readonly pinnedListId = signal<number | undefined>(undefined);

  public readonly featured = computed(() => {
    const lists = this.lists();
    const pinned = this.pinnedListId();
    return (pinned === undefined ? undefined : lists.find((list) => list.id === pinned)) ?? pickLargestList(lists);
  });

  public readonly activeItems = computed(() => activeItemsOf(this.featured()));

  public readonly visibleItems = computed(() => this.activeItems().slice(0, PANEL_ITEM_LIMIT));

  public readonly hiddenCount = computed(() => this.activeItems().length - this.visibleItems().length);

  /** The newest decision per item, so a slow response for an earlier one cannot overwrite a later Undo. */
  private readonly latestIntent = new Map<number, boolean>();

  private readonly translation = inject(TranslationService);

  constructor(
    private store: Store,
    private shoppingListService: ShoppingListService,
    private snackbarService: SnackbarService
  ) {
    inject(DestroyRef).onDestroy(() => this.pending().forEach((entry) => clearTimeout(entry.timer)));
  }

  /** "1.5 kg"; empty when no amount was given. */
  public amountOf(item: ShoppingListItem): string {
    return formatShoppingListItemAmount(item, (text) => this.translation.t(text));
  }

  /** Marks an item done: it leaves the list immediately and an Undo row takes its place for a few seconds. */
  public markDone(item: ShoppingListItem): void {
    if (!this.canUpdate()) {
      return;
    }

    if (this.pending().length === 0) {
      this.pinnedListId.set(item.shoppingListId);
    }

    this.addPending(item);
    this.setChecked(item, true);
  }

  /** Puts a just-finished item back on the list. */
  public undo(entry: PendingUndo): void {
    this.removePending(entry.item.id);
    this.setChecked({ ...entry.item, isChecked: true, checkedAt: new Date().toISOString() }, false);
  }

  /**
   * Crossing off is applied optimistically, like on the shopping lists page, and put back if the server refuses.
   * `before` is the item as it is right now; it is what a failed write restores.
   */
  private setChecked(before: ShoppingListItem, isChecked: boolean): void {
    this.latestIntent.set(before.id, isChecked);
    this.applyItem({ ...before, isChecked, checkedAt: isChecked ? new Date().toISOString() : undefined });

    this.shoppingListService
      .setShoppingListItemChecked(before.id, { isChecked })
      .pipe(take(1))
      .subscribe({
        next: (saved) => {
          if (this.latestIntent.get(before.id) === isChecked) {
            this.applyItem(saved);
          }
        },
        error: (error: HttpErrorResponse) => {
          if (this.latestIntent.get(before.id) === isChecked) {
            this.applyItem(before);
          }

          if (isChecked) {
            this.removePending(before.id);
          }

          // The interceptor already toasts server errors; a request that never got there (status 0) is the one it
          // stays silent on.
          if (error.status === 0) {
            this.snackbarService.error(OFFLINE_MESSAGE);
          }
        },
      });
  }

  private addPending(item: ShoppingListItem): void {
    const timer = setTimeout(() => this.removePending(item.id), UNDO_WINDOW_MS);
    const next = [{ item, timer }, ...this.pending()];
    next.slice(MAX_UNDO_ROWS).forEach((dropped) => clearTimeout(dropped.timer));
    this.pending.set(next.slice(0, MAX_UNDO_ROWS));
  }

  private removePending(itemId: number): void {
    const entry = this.pending().find((candidate) => candidate.item.id === itemId);
    if (entry) {
      clearTimeout(entry.timer);
    }

    const remaining = this.pending().filter((candidate) => candidate.item.id !== itemId);
    this.pending.set(remaining);
    if (remaining.length === 0) {
      this.pinnedListId.set(undefined);
    }
  }

  private applyItem(item: ShoppingListItem): void {
    this.store.dispatch(
      new ApplyShoppingListEvent({
        type: ShoppingListEventType.ItemToggled,
        groupId: this.groupId(),
        shoppingListId: item.shoppingListId,
        item,
      })
    );
  }
}
