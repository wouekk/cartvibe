import { Component, Input, OnInit, ChangeDetectionStrategy, inject } from "@angular/core";
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from "@angular/forms";
import { AppDialogRef } from "../../dialog/app-dialog";
import { Observable, take, tap } from "rxjs";
import { ShoppingList, ShoppingListService, UpsertShoppingListCommand } from "../../open-api";
import { ShoppingListEventType } from "../../store/shopping-list.store";
import { ShoppingListStore } from "../../store/shopping-list.store";
import { SystemSettingsStore } from "../../store/system-settings.store";
import { nameForToday } from "../../utils/app-time-zone";
import { marker } from "../../i18n/marker";
import { DialogComponent } from "../../shared-ui/dialog/dialog.component";
import { InputComponent } from "../../input/input/input.component";
import { DialogFooterComponent } from "../../shared-ui/dialog-footer/dialog-footer.component";
import { TranslatePipe } from "../../i18n/translate.pipe";
import { FormGetPipe } from "../../pipes/form-get.pipe";

export const SHOPPING_LIST_NAME_MAX_LENGTH = 100;

/** Creates a shopping list in a group, or renames one. Closes with the saved list. */
@Component({
    selector: "app-shopping-list-form-dialog",
    templateUrl: "./shopping-list-form-dialog.component.html",
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [
        DialogComponent,
        ReactiveFormsModule,
        InputComponent,
        DialogFooterComponent,
        TranslatePipe,
        FormGetPipe,
    ],
})
export class ShoppingListFormDialogComponent implements OnInit {
  private readonly shoppingListStore = inject(ShoppingListStore);

  private readonly systemSettingsStore = inject(SystemSettingsStore);

  @Input() public groupId!: number;

  @Input() public list?: ShoppingList;

  public form: FormGroup = new FormGroup({});

  constructor(
    private formBuilder: FormBuilder,
    private dialogRef: AppDialogRef<ShoppingListFormDialogComponent, ShoppingList>,
    private shoppingListService: ShoppingListService
  ) {}

  public get headerText(): string {
    return this.list ? marker("Rename List") : marker("Add List");
  }

  public ngOnInit(): void {
    this.form = this.formBuilder.group({
      name: [
        // A new list is one shopping trip, named after its day (Phase 3 S3); editable.
        this.list?.name ?? nameForToday("List", this.systemSettingsStore.timeZone()),
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
          this.shoppingListStore.applyEvent({ type, groupId: list.groupId, shoppingListId: list.id, list });
          this.dialogRef.close(list);
        })
      )
      .subscribe();
  }

  public closeDialog(): void {
    this.dialogRef.close();
  }
}
