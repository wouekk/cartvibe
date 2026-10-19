import { Component, OnDestroy, computed, effect, untracked } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { MatDialog } from "@angular/material/dialog";
import { ActivatedRoute } from "@angular/router";
import { Store } from "@ngxs/store";
import { filter, map, switchMap, take } from "rxjs";
import { Permission, ShoppingList, ShoppingListService } from "../../open-api";
import { ShoppingListStreamService } from "../../services/shopping-list-stream.service";
import { ConfirmationDialogComponent } from "../../shared-ui/confirmation-dialog/confirmation-dialog.component";
import { FilterTab } from "../../shared-ui/filter-bar/filter-tab.interface";
import { AuthState, GroupState } from "../../store";
import { ShoppingListEventType, ShoppingListState } from "../../store/shopping-list.state";
import {
  ApplyShoppingListEvent,
  LoadShoppingLists,
  SelectShoppingList,
} from "../../store/shopping-list.state.actions";
import { hasAll } from "../../utils/permission.utils";
import { ShoppingListFormDialogComponent } from "../shopping-list-form-dialog/shopping-list-form-dialog.component";

@Component({
  selector: "app-shopping-lists-page",
  templateUrl: "./shopping-lists-page.component.html",
  styleUrls: ["./shopping-lists-page.component.scss"],
  standalone: false,
})
export class ShoppingListsPageComponent implements OnDestroy {
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

  /** One tab per list, counting what is still to buy. */
  public readonly listTabs = computed<FilterTab[]>(() =>
    this.lists().map((list) => ({
      value: list.id.toString(),
      label: list.name,
      count: list.items.filter((item) => !item.isChecked).length,
    }))
  );

  public readonly selectedTab = computed(() => this.selectedList()?.id.toString() ?? "");

  constructor(
    private activatedRoute: ActivatedRoute,
    private store: Store,
    private matDialog: MatDialog,
    private shoppingListService: ShoppingListService,
    private shoppingListStreamService: ShoppingListStreamService
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

  public ngOnDestroy(): void {
    this.shoppingListStreamService.disconnect();
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

  public renameList(list: ShoppingList): void {
    const dialogRef = this.matDialog.open(ShoppingListFormDialogComponent);
    dialogRef.componentInstance.groupId = this.groupId();
    dialogRef.componentInstance.list = list;
  }

  public deleteList(list: ShoppingList): void {
    const dialogRef = this.matDialog.open(ConfirmationDialogComponent);
    dialogRef.componentInstance.headerText = "Delete List";
    dialogRef.componentInstance.dialogContent = `Delete "${list.name}" and all of its items?`;

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
