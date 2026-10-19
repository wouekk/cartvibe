import { Component, input } from "@angular/core";
import { FormGroup } from "@angular/forms";
import { SHOPPING_LIST_UNITS } from "../shopping-list-item-form";

/** The amount + unit pair of an item form (see buildShoppingListItemForm), side by side. */
@Component({
  selector: "app-shopping-list-amount-fields",
  templateUrl: "./shopping-list-amount-fields.component.html",
  styleUrls: ["./shopping-list-amount-fields.component.scss"],
  standalone: false,
})
export class ShoppingListAmountFieldsComponent {
  public readonly form = input.required<FormGroup>();

  protected readonly units = SHOPPING_LIST_UNITS;

  protected readonly amountErrors = { pattern: "Enter a number above 0, up to 3 decimals" };
}
