import { Component, computed, input, output } from "@angular/core";
import { ShoppingListItem } from "../../open-api";
import { HEALTH_CHOICES, SEASONALITY_CHOICES } from "../../standalone/components/food-tags/food-tags";
import { formatShoppingListItemAmount } from "../shopping-list-item-form";

/** A person's correction of an item's tags; seasonality is only sent when they chose one. */
export interface ShoppingListItemClassification {
  item: ShoppingListItem;
  health: string;
  seasonality?: string;
}

/**
 * One row of a shopping list. The whole row is the tap target for crossing an item off (or back
 * on), sized for a thumb in a shop; edit, tag corrections and delete sit in a trailing menu.
 */
@Component({
  selector: "app-shopping-list-item",
  templateUrl: "./shopping-list-item.component.html",
  standalone: false,
})
export class ShoppingListItemComponent {
  public readonly item = input.required<ShoppingListItem>();

  public readonly canUpdate = input<boolean>(false);

  /** "1.5 kg"; empty when no amount was given. */
  public readonly amount = computed(() => formatShoppingListItemAmount(this.item()));

  /**
   * Seasonality is offered only for produce the AI already tagged, and only with a health rating the
   * API accepts back, since a correction always carries one.
   */
  public readonly canCorrectSeasonality = computed(() => {
    const item = this.item();
    return (
      (item.seasonality === "SEASONAL" || item.seasonality === "OUT_OF_SEASON") &&
      HEALTH_CHOICES.some((choice) => choice.value === item.health)
    );
  });

  protected readonly healthChoices = HEALTH_CHOICES;

  protected readonly seasonalityChoices = SEASONALITY_CHOICES;

  public readonly toggled = output<ShoppingListItem>();

  public readonly editClicked = output<ShoppingListItem>();

  public readonly deleteClicked = output<ShoppingListItem>();

  public readonly classificationSelected = output<ShoppingListItemClassification>();
}
