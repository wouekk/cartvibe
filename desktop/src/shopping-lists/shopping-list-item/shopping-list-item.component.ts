import { Component, computed, inject, input, output, ChangeDetectionStrategy } from "@angular/core";
import { Store } from "@ngxs/store";
import { TranslationService } from "../../i18n/translation.service";
import { ShoppingListItem } from "../../open-api";
import { UserState } from "../../store/user.state";
import { isLocalItem } from "../shopping-list-pending";
import { HEALTH_CHOICES, SEASONALITY_CHOICES } from "../../standalone/components/food-tags/food-tags";
import { formatShoppingListItemAmount } from "../shopping-list-item-form";
import { AppIconComponent } from "../../shared-ui/icon/icon.component";
import { FoodTagsComponent } from "../../standalone/components/food-tags/food-tags.component";
import { AvatarComponent } from "../../avatar/avatar/avatar.component";
import { BrnButton } from "@spartan-ng/brain/button";
import { HlmButton } from "../../ui/button/lib/hlm-button";
import { CdkMenuTrigger, CdkMenu, CdkMenuItem } from "@angular/cdk/menu";
import { HlmDropdownMenuTrigger } from "../../ui/dropdown-menu/lib/hlm-dropdown-menu-trigger";
import { HlmDropdownMenu } from "../../ui/dropdown-menu/lib/hlm-dropdown-menu";
import { HlmDropdownMenuFocusOnHover } from "../../ui/dropdown-menu/lib/hlm-dropdown-menu-focus-on-hover";
import { HlmDropdownMenuItem } from "../../ui/dropdown-menu/lib/hlm-dropdown-menu-item";
import { HlmDropdownMenuSubTrigger } from "../../ui/dropdown-menu/lib/hlm-dropdown-menu-sub-trigger";
import { HlmDropdownMenuSub } from "../../ui/dropdown-menu/lib/hlm-dropdown-menu-sub";
import { TranslatePipe } from "../../i18n/translate.pipe";

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
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [
        AppIconComponent,
        FoodTagsComponent,
        AvatarComponent,
        BrnButton,
        HlmButton,
        CdkMenuTrigger,
        HlmDropdownMenuTrigger,
        CdkMenu,
        HlmDropdownMenu,
        CdkMenuItem,
        HlmDropdownMenuFocusOnHover,
        HlmDropdownMenuItem,
        HlmDropdownMenuSubTrigger,
        HlmDropdownMenuSub,
        TranslatePipe,
    ],
})
export class ShoppingListItemComponent {
  public readonly item = input.required<ShoppingListItem>();

  public readonly canUpdate = input<boolean>(false);

  /** A change to this row is kept on the device and has not reached the server yet. */
  public readonly pending = input<boolean>(false);

  /** Shop mode: a taller row and a larger name. */
  public readonly large = input<boolean>(false);

  /** A row added on this device that the server has not seen: it has no id to edit by yet. */
  public readonly isLocal = computed(() => isLocalItem(this.item()));

  private readonly users = inject(Store).selectSignal(UserState.users);

  /** Who crossed the item off, when it is crossed off and that person is still known. */
  public readonly checkedBy = computed(() => {
    const item = this.item();
    if (!item.isChecked || !item.checkedByUserId) {
      return undefined;
    }
    return (this.users() ?? []).find((user) => Number(user.id) === item.checkedByUserId);
  });

  private readonly translation = inject(TranslationService);

  /** "1.5 kg"; empty when no amount was given. */
  public readonly amount = computed(() =>
    formatShoppingListItemAmount(
      this.item(),
      (text) => this.translation.t(text),
      (count, singular, plural) => this.translation.plural(count, singular, plural)
    )
  );

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
