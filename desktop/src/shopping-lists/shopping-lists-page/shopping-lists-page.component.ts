import {
  Component,
  OnDestroy,
  OnInit,
  TemplateRef,
  computed,
  effect,
  signal,
  untracked,
  inject,
  viewChild,
  ChangeDetectionStrategy,
} from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { AppDialog } from "../../dialog/app-dialog";
import { ActivatedRoute, Router } from "@angular/router";
import { Store } from "@ngxs/store";
import { concatMap, filter, from, map, switchMap, take, tap, toArray } from "rxjs";
import { Permission, ShoppingList, ShoppingListService } from "../../open-api";
import { SnackbarService } from "../../services";
import { ToastRef } from "../../toast/toast.service";
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

  /** The switcher under the open list: one card per list still being shopped, newest first, with what is left to buy. */
  public readonly activeCards = computed(() =>
    activeLists(this.lists()).map((list) => {
      const toBuy = list.items.filter((item) => !item.isChecked);
      const names = toBuy.slice(0, 3).map((item) => item.name);
      const more = toBuy.length - names.length;
      return {
        id: list.id,
        name: list.name,
        past: false,
        list,
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

  /** The latest finished lists, newest first, behind the "Completed (n)" toggle. */
  public readonly completedCards = computed(() =>
    recentPastLists(this.lists()).map((list) => {
      const names = list.items.slice(0, 3).map((item) => item.name);
      const more = list.items.length - names.length;
      return {
        id: list.id,
        name: list.name,
        past: true,
        list,
        count: list.items.length,
        preview:
          more > 0
            ? this.translation.t("{names}, and {count} more", { names: names.join(", "), count: more })
            : names.join(", "),
      };
    })
  );

  /** The active cards are left out when their only card would be the list already open above them. */
  public readonly showActiveCards = computed(() => {
    const cards = this.activeCards();
    return cards.length > 1 || (cards.length === 1 && cards[0].id !== this.selectedList()?.id);
  });

  /** Finished lists stay folded away until asked for, like the crossed-off items inside a list. */
  public readonly showCompleted = signal(false);

  /** What is left to buy on the open list, for its workspace header. */
  public readonly toBuyCount = computed(
    () => this.selectedList()?.items.filter((item) => !item.isChecked).length ?? 0
  );

  public readonly announcing = signal(false);

  /** True while a whole list is being crossed off or put back, so the buttons cannot fire twice. */
  public readonly completing = signal(false);

  /** The list "Mark as complete" just finished and the items it crossed off, for the toast's Undo. */
  public readonly lastCompleted = signal<{ listId: number; name: string; itemIds: number[] } | undefined>(undefined);

  private readonly completedToast = viewChild.required<TemplateRef<unknown>>("completedToast");

  private completedToastRef?: ToastRef;

  private readonly wakeLock = inject(ScreenWakeLockService);

  /** The "Keep screen on" switch is offered only where the browser can do it. */
  public readonly canKeepScreenOn = this.wakeLock.supported;

  public readonly keepScreenOn = this.wakeLock.enabled;

  public readonly online = inject(OnlineStatusService).online;

  public readonly canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

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

  /** The open list's card carries the selected style; a finished list's card is dimmed. */
  public cardClass(id: number, past: boolean): string {
    if (id === this.selectedList()?.id) {
      return "border-primary! bg-accent/30 ring-1 ring-primary/20 text-card-foreground";
    }

    return past ? "bg-muted/30 text-muted-foreground" : "bg-card text-card-foreground";
  }

  public selectList(id: number): void {
    this.store.dispatch(new SelectShoppingList(id));
  }

  /**
   * Everything was bought as planned: crosses the whole list off in one go and opens the next list still being
   * shopped. The toast's Undo puts back exactly the items this crossed off.
   */
  public completeList(list: ShoppingList): void {
    const itemIds = list.items.filter((item) => !item.isChecked).map((item) => item.id);
    if (itemIds.length === 0) {
      return;
    }

    navigator.vibrate?.(10);
    this.setListChecked(list, true, undefined, () => {
      const next = activeLists(this.lists())[0];
      if (next) {
        this.selectList(next.id);
      }

      this.lastCompleted.set({ listId: list.id, name: list.name, itemIds });
      this.completedToastRef?.dismiss();
      this.completedToastRef = this.snackbarService.successFromTemplate(this.completedToast(), { duration: 8000 });
    });
  }

  public undoComplete(): void {
    const completed = this.lastCompleted();
    this.completedToastRef?.dismiss();
    this.completedToastRef = undefined;
    const list = completed && this.lists().find((candidate) => candidate.id === completed.listId);
    if (!completed || !list) {
      return;
    }

    this.lastCompleted.set(undefined);
    this.setListChecked(list, false, completed.itemIds, () => this.selectList(list.id));
  }

  /** A finished list back on the go: every item un-crossed, and the list opened. */
  public restoreList(list: ShoppingList): void {
    this.setListChecked(list, false, undefined, () => this.selectList(list.id));
  }

  private setListChecked(list: ShoppingList, isChecked: boolean, itemIds: number[] | undefined, done: () => void): void {
    this.completing.set(true);
    this.shoppingListService
      .setShoppingListChecked(list.id, { isChecked, itemIds })
      .pipe(take(1))
      .subscribe({
        next: (saved) => {
          this.store.dispatch(
            new ApplyShoppingListEvent({
              type: ShoppingListEventType.ListUpdated,
              groupId: saved.groupId,
              shoppingListId: saved.id,
              list: saved,
            })
          );
          this.completing.set(false);
          done();
        },
        // The interceptor toasts the refusal.
        error: () => this.completing.set(false),
      });
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
    const text = shoppingListToText(
      list,
      (word) => this.translation.t(word),
      (count, singular, plural) => this.translation.plural(count, singular, plural)
    );
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
