import { Component, input, ChangeDetectionStrategy } from "@angular/core";
import { FormGroup } from "@angular/forms";
import { SHOPPING_LIST_UNITS } from "../shopping-list-item-form";
import { marker } from "../../i18n/marker";

/** The amount + unit pair of an item form (see buildShoppingListItemForm), side by side. */
@Component({
  selector: "app-shopping-list-amount-fields",
  templateUrl: "./shopping-list-amount-fields.component.html",
  host: { class: "block" },
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class ShoppingListAmountFieldsComponent {
  public readonly form = input.required<FormGroup>();

  protected readonly units = SHOPPING_LIST_UNITS;

  protected readonly amountErrors = { pattern: marker("Enter a number above 0, up to 3 decimals") };
}
