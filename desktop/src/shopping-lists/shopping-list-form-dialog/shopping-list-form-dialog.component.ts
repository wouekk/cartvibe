import { Component, Input, OnInit } from "@angular/core";
import { FormBuilder, FormGroup, Validators } from "@angular/forms";
import { MatDialogRef } from "@angular/material/dialog";
import { Store } from "@ngxs/store";
import { Observable, take, tap } from "rxjs";
import { ShoppingList, ShoppingListService, UpsertShoppingListCommand } from "../../open-api";
import { ShoppingListEventType } from "../../store/shopping-list.state";
import { ApplyShoppingListEvent } from "../../store/shopping-list.state.actions";
import { SystemSettingsState } from "../../store/system-settings.state";
import { nameForToday } from "../../utils/app-time-zone";

export const SHOPPING_LIST_NAME_MAX_LENGTH = 100;

/** Creates a shopping list in a group, or renames one. Closes with the saved list. */
@Component({
  selector: "app-shopping-list-form-dialog",
  templateUrl: "./shopping-list-form-dialog.component.html",
  standalone: false,
})
export class ShoppingListFormDialogComponent implements OnInit {
  @Input() public groupId!: number;

  @Input() public list?: ShoppingList;

  public form: FormGroup = new FormGroup({});

  constructor(
    private formBuilder: FormBuilder,
    private matDialogRef: MatDialogRef<ShoppingListFormDialogComponent, ShoppingList>,
    private shoppingListService: ShoppingListService,
    private store: Store
  ) {}

  public get headerText(): string {
    return this.list ? "Rename List" : "Add List";
  }

  public ngOnInit(): void {
    this.form = this.formBuilder.group({
      name: [
        // A new list is one shopping trip, named after its day (Phase 3 S3); editable.
        this.list?.name ?? nameForToday("List", this.store.selectSnapshot(SystemSettingsState.timeZone)),
        [Validators.required, Validators.maxLength(SHOPPING_LIST_NAME_MAX_LENGTH)],
      ],
    });
  }

  public submit(): void {
    const name = (this.form.value.name ?? "").trim();
    if (this.form.invalid || name.length === 0) {
      this.form.markAllAsTouched();
      return;
    }

    const command: UpsertShoppingListCommand = { name };
    const request: Observable<ShoppingList> = this.list
      ? this.shoppingListService.updateShoppingList(this.list.id, command)
      : this.shoppingListService.createShoppingList(this.groupId, command);
    const type = this.list ? ShoppingListEventType.ListUpdated : ShoppingListEventType.ListCreated;

    request
      .pipe(
        take(1),
        tap((list) => {
          this.store.dispatch(
            new ApplyShoppingListEvent({ type, groupId: list.groupId, shoppingListId: list.id, list })
          );
          this.matDialogRef.close(list);
        })
      )
      .subscribe();
  }

  public closeDialog(): void {
    this.matDialogRef.close();
  }
}
