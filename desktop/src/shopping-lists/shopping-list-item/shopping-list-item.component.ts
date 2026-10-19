import { Component, input, output } from "@angular/core";
import { ShoppingListItem } from "../../open-api";

/**
 * One row of a shopping list. The whole row is the tap target for crossing an item off (or back
 * on), sized for a thumb in a shop; edit and delete sit in a trailing menu.
 */
@Component({
  selector: "app-shopping-list-item",
  templateUrl: "./shopping-list-item.component.html",
  styleUrls: ["./shopping-list-item.component.scss"],
  standalone: false,
})
export class ShoppingListItemComponent {
  public readonly item = input.required<ShoppingListItem>();

  public readonly canUpdate = input<boolean>(false);

  public readonly toggled = output<ShoppingListItem>();

  public readonly editClicked = output<ShoppingListItem>();

  public readonly deleteClicked = output<ShoppingListItem>();
}
