import { HttpContext } from "@angular/common/http";
import { DOCUMENT } from "@angular/common";
import { effect, inject, Injectable, OnDestroy, signal, untracked } from "@angular/core";
import { Actions, ofActionSuccessful, Store } from "@ngxs/store";
import { debounceTime, firstValueFrom, Subscription } from "rxjs";
import { TranslationService } from "../i18n/translation.service";
import { QUIET_ERRORS } from "../interceptors/http-interceptor";
import { OfflineStorageService } from "../offline/offline-storage.service";
import { isWorthRetrying, RetryWhenReachable } from "../offline/retry-when-reachable";
import { ShoppingListService } from "../open-api";
import { PendingChange } from "../shopping-lists/shopping-list-pending";
import { AuthState } from "../store/auth.state";
import { Logout } from "../store/auth.state.actions";
import { CachedShoppingLists, ShoppingListState, shoppingListsCacheKey } from "../store/shopping-list.state";
import {
  LoadShoppingLists,
  RestorePendingShoppingListChanges,
  SettleShoppingListChange,
} from "../store/shopping-list.state.actions";
import { ShoppingListStreamService } from "./shopping-list-stream.service";
import { SnackbarService } from "./snackbar.service";
import { TokenRefreshService } from "./token-refresh.service";

export const SHOPPING_LIST_OUTBOX_KEY = "shopping-lists:outbox";

/** How long the lists may change before the device's copy is written: one write for a burst of events. */
const CACHE_WRITE_DELAY_MS = 250;

/**
 * Sends the shopping list changes made on this device (`ShoppingListState.pending`) to the server, oldest first, and
 * keeps both the queue and a copy of the open group's lists on the device, so a phone without signal in the shop can
 * still open the list, add to it and cross things off, and nothing is lost when the app is closed meanwhile.
 *
 * It tries when a change is queued and when the live stream comes up, and otherwise as `RetryWhenReachable` does.
 * One change is on its way at a time, so the order is kept: an item is added before it is crossed off.
 */
@Injectable({ providedIn: "root" })
export class ShoppingListSyncService implements OnDestroy {
  private readonly store = inject(Store);
  private readonly actions = inject(Actions);
  private readonly storage = inject(OfflineStorageService);
  private readonly shoppingListService = inject(ShoppingListService);
  private readonly tokenRefreshService = inject(TokenRefreshService);
  private readonly snackbarService = inject(SnackbarService);
  private readonly translation = inject(TranslationService);
  private readonly stream = inject(ShoppingListStreamService);

  private readonly subscriptions = new Subscription();

  private readonly retry = new RetryWhenReachable(inject(DOCUMENT), () => this.sendAll());

  /** Resolves once the queue the device kept has been put back; nothing is written over it before that. */
  public readonly ready: Promise<void>;

  /**
   * True while changes wait because the last attempt to send one did not reach the server. First-hand knowledge
   * that the server is out of reach, sooner than the stream finds out, so the page does not say "Live" over it.
   */
  public readonly stalled = signal(false);

  constructor() {
    this.ready = this.restore();

    // The stream coming up is the best sign that the server can be reached again.
    effect(() => {
      if (this.stream.status() === "live") {
        untracked(() => this.retry.kick());
      }
    });

    this.subscriptions.add(
      this.actions.pipe(ofActionSuccessful(Logout)).subscribe(() => {
        this.retry.cancel();
        this.stalled.set(false);
        void this.storage.clear();
      })
    );
  }

  public ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.retry.dispose();
  }

  /** Sends what is waiting now; resolves when the attempt has ended. */
  public flush(): Promise<void> {
    return this.retry.run();
  }

  /**
   * For an action that acts on the list as the server has it (clearing what is crossed off, completing or
   * restoring a list): sends the queue first and says whether the server now has everything. False means it could
   * not be reached, and the action should not go ahead on a list the server sees differently.
   */
  public async drained(): Promise<boolean> {
    await this.ready;
    await this.flush();
    return this.store.selectSnapshot(ShoppingListState.pending).length === 0;
  }

  private async restore(): Promise<void> {
    const kept = await this.storage.get<PendingChange[]>(SHOPPING_LIST_OUTBOX_KEY);
    if (Array.isArray(kept) && kept.length > 0 && this.store.selectSnapshot(AuthState.isLoggedIn)) {
      this.store.dispatch(new RestorePendingShoppingListChanges(kept));
    }

    this.subscriptions.add(
      this.store.select(ShoppingListState.pending).subscribe((pending) => {
        void this.storage.set(SHOPPING_LIST_OUTBOX_KEY, pending);
        if (pending.length > 0) {
          this.retry.kick();
        }
      })
    );

    this.subscriptions.add(
      this.store
        .select(ShoppingListState.cacheSnapshot)
        .pipe(debounceTime(CACHE_WRITE_DELAY_MS))
        .subscribe(({ groupId, lists, selectedListId }) => {
          if (groupId !== undefined) {
            void this.storage.set(shoppingListsCacheKey(groupId), { lists, selectedListId } satisfies CachedShoppingLists);
          }
        })
    );
  }

  /** True when the queue is empty, false when the server could not be reached and the rest must wait. */
  private async sendAll(): Promise<boolean> {
    for (;;) {
      const change = this.store.selectSnapshot(ShoppingListState.pending)[0];
      if (!change) {
        this.stalled.set(false);
        return true;
      }

      if (!(await this.tokenRefreshService.ensureFreshToken()) || !(await this.send(change))) {
        // Signed out meanwhile: the queue went with the session and there is nothing to wait for.
        const signedOut = !this.store.selectSnapshot(AuthState.isLoggedIn);
        this.stalled.set(!signedOut);
        return signedOut;
      }

      this.stalled.set(false);
    }
  }

  /** True when the change is dealt with (saved or refused), false when it should be tried again later. */
  private async send(change: PendingChange): Promise<boolean> {
    const options = { context: new HttpContext().set(QUIET_ERRORS, true) };

    try {
      if (change.kind === "add") {
        const saved = await firstValueFrom(
          this.shoppingListService.addShoppingListItem(
            change.listId,
            { ...change.command, clientId: change.clientId },
            "body",
            false,
            options
          )
        );
        this.store.dispatch(new SettleShoppingListChange(change.opId, saved));
        return true;
      }

      if (change.itemId < 0) {
        // Its item never reached the server (the add was refused), so there is nothing to cross off.
        this.store.dispatch(new SettleShoppingListChange(change.opId));
        return true;
      }

      const saved = await firstValueFrom(
        this.shoppingListService.setShoppingListItemChecked(change.itemId, { isChecked: change.isChecked }, "body", false, options)
      );
      this.store.dispatch(new SettleShoppingListChange(change.opId, saved));
      return true;
    } catch (error) {
      if (isWorthRetrying(error)) {
        return false;
      }

      // Refused: the change is dropped and the lists are read again, so the page shows what the server has. An
      // item someone else deleted meanwhile is the usual reason for a cross-off, and needs no words.
      this.store.dispatch(new SettleShoppingListChange(change.opId));
      if (change.kind === "add") {
        this.snackbarService.error(
          this.translation.t("\"{name}\" could not be added to the list.", { name: change.item.name })
        );
      }
      if (this.store.selectSnapshot(ShoppingListState.groupId) === change.groupId) {
        this.store.dispatch(new LoadShoppingLists(change.groupId));
      }
      return true;
    }
  }
}
