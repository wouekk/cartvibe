import { Component, Input, OnInit, ChangeDetectionStrategy } from "@angular/core";
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from "@angular/forms";
import { AppDialogRef } from "../../dialog/app-dialog";
import { Store } from "@ngxs/store";
import { take, tap } from "rxjs";
import { ShoppingListItem, ShoppingListService } from "../../open-api";
import { ShoppingListEventType } from "../../store/shopping-list.state";
import { ApplyShoppingListEvent } from "../../store/shopping-list.state.actions";
import { buildShoppingListItemForm, toUpsertShoppingListItemCommand } from "../shopping-list-item-form";
import { DialogComponent } from "../../shared-ui/dialog/dialog.component";
import { InputComponent } from "../../input/input/input.component";
import { ShoppingListAmountFieldsComponent } from "../shopping-list-amount-fields/shopping-list-amount-fields.component";
import { DialogFooterComponent } from "../../shared-ui/dialog-footer/dialog-footer.component";
import { TranslatePipe } from "../../i18n/translate.pipe";
import { FormGetPipe } from "../../pipes/form-get.pipe";

/** Edits an existing item's name, quantity and note. Closes with the saved item. */
@Component({
    selector: "app-shopping-list-item-form-dialog",
    templateUrl: "./shopping-list-item-form-dialog.component.html",
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [
        DialogComponent,
        ReactiveFormsModule,
        InputComponent,
        ShoppingListAmountFieldsComponent,
        DialogFooterComponent,
        TranslatePipe,
        FormGetPipe,
    ],
})
export class ShoppingListItemFormDialogComponent implements OnInit {
  @Input() public groupId!: number;

  @Input() public item!: ShoppingListItem;

  public form: FormGroup = new FormGroup({});

  constructor(
    private formBuilder: FormBuilder,
    private matDialogRef: AppDialogRef<ShoppingListItemFormDialogComponent, ShoppingListItem>,
    private shoppingListService: ShoppingListService,
    private store: Store
  ) {}

  public ngOnInit(): void {
    this.form = buildShoppingListItemForm(this.formBuilder, this.item);
    this.form.get("name")?.addValidators(Validators.required);
  }

  public submit(): void {
    const command = toUpsertShoppingListItemCommand(this.form, this.item.quantity);
    if (this.form.invalid || command.name.length === 0) {
      this.form.markAllAsTouched();
      return;
    }

    this.shoppingListService
      .updateShoppingListItem(this.item.id, command)
      .pipe(
        take(1),
        tap((item) => {
          this.store.dispatch(
            new ApplyShoppingListEvent({
              type: ShoppingListEventType.ItemUpdated,
              groupId: this.groupId,
              shoppingListId: item.shoppingListId,
              item,
            })
          );
          this.matDialogRef.close(item);
        })
      )
      .subscribe();
  }

  public closeDialog(): void {
    this.matDialogRef.close();
  }
}
