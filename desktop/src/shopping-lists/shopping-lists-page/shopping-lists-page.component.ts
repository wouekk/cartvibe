import { Component, OnDestroy, OnInit, computed, effect, signal, untracked, inject, ChangeDetectionStrategy } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { AppDialog } from "../../dialog/app-dialog";
import { ActivatedRoute, Router } from "@angular/router";
import { Store } from "@ngxs/store";
import { catchError, concatMap, EMPTY, filter, from, map, switchMap, take, tap, toArray } from "rxjs";
import { Permission, ShoppingList, ShoppingListService } from "../../open-api";
import { SnackbarService } from "../../services";
import { OnlineStatusService } from "../../services/online-status.service";
import { ScreenWakeLockService } from "../../services/screen-wake-lock.service";
import { ShoppingListStreamService } from "../../services/shopping-list-stream.service";
import { ConfirmationDialogComponent } from "../../shared-ui/confirmation-dialog/confirmation-dialog.component";
import { AuthState, GroupState } from "../../store";
import { nameForToday } from "../../utils/app-time-zone";
import { SystemSettingsState } from "../../store/system-settings.state";
import { ShoppingListEventType, ShoppingListState } from "../../store/shopping-list.state";
import {
  ApplyShoppingListEvent,
  LoadShoppingLists,
  SelectShoppingList,
} from "../../store/shopping-list.state.actions";
import { hasAll } from "../../utils/permission.utils";
import { activeLists, recentPastLists } from "../shopping-list-groups";
import { shoppingListToText } from "../shopping-list-share";
import { ShoppingListFormDialogComponent } from "../shopping-list-form-dialog/shopping-list-form-dialog.component";
import { TranslationService } from "../../i18n/translation.service";
import { marker } from "../../i18n/marker";

@Component({
  selector: "app-shopping-lists-page",
  templateUrl: "./shopping-lists-page.component.html",
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class ShoppingListsPageComponent implements OnInit, OnDestroy {
  private readonly translation = inject(TranslationService);

  public readonly groupId = toSignal(
    this.activatedRoute.paramMap.pipe(map((params) => Number(params.get("groupId")))),
    { requireSync: true }
  );

  public readonly lists = this.store.selectSignal(ShoppingListState.lists);

  public readonly selectedList = this.store.selectSignal(ShoppingListState.selectedList);

  private readonly loadedGroupId = this.store.selectSignal(ShoppingListState.groupId);

  /** False until this group's lists arrive, so a group switch never flashes the previous group's. */
  public readonly isLoaded = computed(() => this.loadedGroupId() === this.groupId());

  private readonly groups = this.store.selectSignal(GroupState.groups);

  public readonly groupName = computed(
    () => this.groups().find((group) => group.id === this.groupId())?.name ?? ""
  );

  private readonly groupPermissions = this.store.selectSignal(AuthState.groupPermissions);

  private readonly permissions = computed(() => this.groupPermissions()[this.groupId()] ?? []);

  public readonly canCreate = computed(() => hasAll(this.permissions(), Permission.GroupShoppingListsCreate));

  public readonly canUpdate = computed(() => hasAll(this.permissions(), Permission.GroupShoppingListsUpdate));

  public readonly canDelete = computed(() => hasAll(this.permissions(), Permission.GroupShoppingListsDelete));

  /** One card per list still being shopped: its name, what is left to buy and the first few items (Phase 3 S2). */
  public readonly listCards = computed(() =>
    activeLists(this.lists()).map((list) => {
      const toBuy = list.items.filter((item) => !item.isChecked);
      const names = toBuy.slice(0, 3).map((item) => item.name);
      const more = toBuy.length - names.length;
      return {
        id: list.id,
        name: list.name,
        count: toBuy.length,
        preview:
          toBuy.length === 0
            ? marker("Nothing added yet")
            : more > 0
              ? this.translation.t("{names}, and {count} more", { names: names.join(", "), count: more })
              : names.join(", "),
      };
    })
  );

  /** What is left to buy on the open list, for its workspace header. */
  public readonly toBuyCount = computed(
    () => this.selectedList()?.items.filter((item) => !item.isChecked).length ?? 0
  );

  public readonly announcing = signal(false);

  /** Choosing lists to delete: the cards become checkable and the header offers Delete (n) and Cancel. */
  public readonly selecting = signal(false);

  public readonly selectedIds = signal<ReadonlySet<number>>(new Set());

  public readonly selectedCount = computed(() => this.selectedIds().size);

  public readonly deleting = signal(false);

  public readonly canDeleteLists = computed(() => this.canDelete() && this.lists().length > 0);

  private readonly wakeLock = inject(ScreenWakeLockService);

  /** The "Keep screen on" switch is offered only where the browser can do it. */
  public readonly canKeepScreenOn = this.wakeLock.supported;

  public readonly keepScreenOn = this.wakeLock.enabled;

  public readonly online = inject(OnlineStatusService).online;

  public readonly canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  /** Finished lists (everything crossed off), the latest few, shown beside the open list. */

  public readonly pastLists = computed(() => recentPastLists(this.lists()));

  constructor(
    private activatedRoute: ActivatedRoute,
    private router: Router,
    private store: Store,
    private matDialog: AppDialog,
    private shoppingListService: ShoppingListService,
    private shoppingListStreamService: ShoppingListStreamService,
    private snackbarService: SnackbarService
  ) {
    // Imperative side effect of the route's group changing: load it and move the live stream to it.
    effect(() => {
      const groupId = this.groupId();
      untracked(() => {
        this.store.dispatch(new LoadShoppingLists(groupId));
        this.shoppingListStreamService.connect(groupId);
      });
    });
  }

  /** The Dashboard's "New list" lands here with `?new=list` and opens the dialog straight away. */
  public ngOnInit(): void {
    if (this.activatedRoute.snapshot?.queryParamMap.get("new") !== "list") {
      return;
    }

    // Dropped from the URL, so a reload or Back does not open it again.
    this.router.navigate([], { relativeTo: this.activatedRoute, queryParams: {}, replaceUrl: true });
    if (this.canCreate()) {
      this.addList();
    }
  }

  public ngOnDestroy(): void {
    this.shoppingListStreamService.disconnect();
    void this.wakeLock.disable();
  }

  public startSelecting(): void {
    this.selectedIds.set(new Set());
    this.selecting.set(true);
  }

  public cancelSelecting(): void {
    this.selecting.set(false);
    this.selectedIds.set(new Set());
  }

  public isSelected(id: number): boolean {
    return this.selectedIds().has(id);
  }

  /** What a card is "pressed" for: ticked while choosing lists to delete, otherwise the open list. */
  public isPressed(id: number): boolean {
    return this.selecting() ? this.isSelected(id) : id === this.selectedList()?.id;
  }

  public cardClass(id: number): string {
    if (this.selecting()) {
      return this.isSelected(id) ? "border-destructive! bg-destructive/10 ring-1 ring-destructive/30" : "";
    }

    return id === this.selectedList()?.id ? "border-primary! bg-accent/30 ring-1 ring-primary/20" : "";
  }

  /** A card or past list was clicked: it opens the list, or ticks it while choosing lists to delete. */
  public pick(id: number): void {
    if (!this.selecting()) {
      this.selectList(id.toString());
      return;
    }

    this.selectedIds.update((ids) => {
      const next = new Set(ids);
      if (!next.delete(id)) {
        next.add(id);
      }
      return next;
    });
  }

  /** Deletes the ticked lists one after another; the ones the server refused stay ticked. */
  public deleteSelected(): void {
    const chosen = this.lists().filter((list) => this.selectedIds().has(list.id));
    if (chosen.length === 0) {
      return;
    }

    const dialogRef = this.matDialog.open(ConfirmationDialogComponent);
    dialogRef.componentInstance.headerText = marker("Delete Lists");
    dialogRef.componentInstance.dialogContent = this.translation.t("Delete {count} lists and all of their items?", {
      count: chosen.length,
    });

    dialogRef
      .afterClosed()
      .pipe(
        take(1),
        // Truthiness, not === true: a backdrop click or ESC closes with undefined.
        filter((confirmed) => !!confirmed),
        tap(() => this.deleting.set(true)),
        switchMap(() =>
          from(chosen).pipe(
            concatMap((list) =>
              this.shoppingListService.deleteShoppingList(list.id).pipe(
                tap(() =>
                  this.store.dispatch(
                    new ApplyShoppingListEvent({
                      type: ShoppingListEventType.ListDeleted,
                      groupId: list.groupId,
                      shoppingListId: list.id,
                    })
                  )
                ),
                map(() => list.id),
                // The interceptor already toasts the refusal; carry on with the rest.
                catchError(() => EMPTY)
              )
            ),
            toArray()
          )
        )
      )
      .subscribe((deletedIds) => {
        this.deleting.set(false);
        if (deletedIds.length === chosen.length) {
          this.cancelSelecting();
          return;
        }

        this.selectedIds.set(new Set(chosen.map((list) => list.id).filter((id) => !deletedIds.includes(id))));
        this.snackbarService.error("Some lists could not be deleted.");
      });
  }

  public selectList(value: string): void {
    this.store.dispatch(new SelectShoppingList(Number(value)));
  }

  public addList(): void {
    const dialogRef = this.matDialog.open(ShoppingListFormDialogComponent);
    dialogRef.componentInstance.groupId = this.groupId();

    dialogRef
      .afterClosed()
      .pipe(
        take(1),
        filter((list): list is ShoppingList => !!list)
      )
      .subscribe((list) => this.store.dispatch(new SelectShoppingList(list.id)));
  }

  /**
   * Starts a new list (named after today) with the open and crossed-off items of this one, all
   * unchecked: the same shop again, without retyping it (Phase 3 S2).
   */
  public copyList(list: ShoppingList): void {
    const name = nameForToday("List", this.store.selectSnapshot(SystemSettingsState.timeZone));

    this.shoppingListService
      .createShoppingList(this.groupId(), { name })
      .pipe(
        take(1),
        tap((created) =>
          this.store.dispatch(
            new ApplyShoppingListEvent({
              type: ShoppingListEventType.ListCreated,
              groupId: created.groupId,
              shoppingListId: created.id,
              list: created,
            })
          )
        ),
        concatMap((created) =>
          from(list.items).pipe(
            concatMap((item) =>
              this.shoppingListService.addShoppingListItem(created.id, {
                name: item.name,
                amount: item.amount ?? undefined,
                unit: item.amount ? item.unit : undefined,
                quantity: item.amount ? undefined : item.quantity || undefined,
                note: item.note || undefined,
              })
            ),
            tap((item) =>
              this.store.dispatch(
                new ApplyShoppingListEvent({
                  type: ShoppingListEventType.ItemAdded,
                  groupId: created.groupId,
                  shoppingListId: created.id,
                  item,
                })
              )
            ),
            toArray(),
            map(() => created)
          )
        )
      )
      .subscribe((created) => this.store.dispatch(new SelectShoppingList(created.id)));
  }

  /** Tells the rest of the household you are going shopping, so they add what they need (Phase 3 S4). */
  public announceGoingShopping(): void {
    this.announcing.set(true);
    this.shoppingListService
      .announceGoingShopping(this.groupId())
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.snackbarService.success("The household has been told you are going shopping.");
          this.announcing.set(false);
        },
        error: () => this.announcing.set(false),
      });
  }

  /** In the shop the screen going dark mid-aisle is the annoyance, so it is a per-visit switch, off by default. */
  public toggleKeepScreenOn(): void {
    if (this.wakeLock.enabled()) {
      void this.wakeLock.disable();
      return;
    }

    void this.wakeLock.enable().then((enabled) => {
      if (!enabled) {
        this.snackbarService.hint("Could not keep the screen on.");
      }
    });
  }

  /** The share sheet where there is one (phones), otherwise the text goes to the clipboard. */
  public shareList(list: ShoppingList): void {
    const text = shoppingListToText(list, (word) => this.translation.t(word));
    if (this.canShare) {
      navigator.share({ title: list.name, text }).catch(() => undefined);
      return;
    }

    navigator.clipboard
      ?.writeText(text)
      .then(() => this.snackbarService.hint("List copied to the clipboard."))
      .catch(() => this.snackbarService.error("Could not copy the list."));
  }

  public renameList(list: ShoppingList): void {
    const dialogRef = this.matDialog.open(ShoppingListFormDialogComponent);
    dialogRef.componentInstance.groupId = this.groupId();
    dialogRef.componentInstance.list = list;
  }

  public deleteList(list: ShoppingList): void {
    const dialogRef = this.matDialog.open(ConfirmationDialogComponent);
    dialogRef.componentInstance.headerText = marker("Delete List");
    dialogRef.componentInstance.dialogContent = this.translation.t("Delete \"{name}\" and all of its items?", { name: list.name });

    dialogRef
      .afterClosed()
      .pipe(
        take(1),
        // Truthiness, not === true: a backdrop click or ESC closes with undefined.
        filter((confirmed) => !!confirmed),
        switchMap(() => this.shoppingListService.deleteShoppingList(list.id))
      )
      .subscribe(() =>
        this.store.dispatch(
          new ApplyShoppingListEvent({
            type: ShoppingListEventType.ListDeleted,
            groupId: list.groupId,
            shoppingListId: list.id,
          })
        )
      );
  }
}
