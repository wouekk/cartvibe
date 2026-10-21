import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { ReactiveFormsModule } from "@angular/forms";
import { HlmButton } from "@spartan-ng/helm/button";
import { AppIconComponent } from "../shared-ui/icon/icon.component";
import { HlmBadge } from "@spartan-ng/helm/badge";
import { HlmDropdownMenuImports } from "@spartan-ng/helm/dropdown-menu";
import { InputModule } from "../input";
import { PipesModule } from "../pipes/pipes.module";
import { SelectModule } from "../select/select.module";
import { SharedUiModule } from "../shared-ui/shared-ui.module";
import { ShoppingListAmountFieldsComponent } from "./shopping-list-amount-fields/shopping-list-amount-fields.component";
import { ShoppingListFormDialogComponent } from "./shopping-list-form-dialog/shopping-list-form-dialog.component";
import { ShoppingListItemFormDialogComponent } from "./shopping-list-item-form-dialog/shopping-list-item-form-dialog.component";
import { ShoppingListItemComponent } from "./shopping-list-item/shopping-list-item.component";
import { ShoppingListComponent } from "./shopping-list/shopping-list.component";
import { ShoppingListsPageComponent } from "./shopping-lists-page/shopping-lists-page.component";
import { ShoppingListsRoutingModule } from "./shopping-lists-routing.module";
import { ShoppingTripsComponent } from "./shopping-trips/shopping-trips.component";
import { AttachReceiptDialogComponent } from "./attach-receipt-dialog/attach-receipt-dialog.component";
import { FoodTagsComponent } from "../standalone/components/food-tags/food-tags.component";

@NgModule({
  declarations: [
    AttachReceiptDialogComponent,
    ShoppingListAmountFieldsComponent,
    ShoppingListComponent,
    ShoppingListFormDialogComponent,
    ShoppingListItemComponent,
    ShoppingListItemFormDialogComponent,
    ShoppingListsPageComponent,
    ShoppingTripsComponent,
  ],
  imports: [
    CommonModule,
    FoodTagsComponent,
    InputModule,
    HlmButton,
    AppIconComponent,
    HlmBadge,
    ...HlmDropdownMenuImports,
    PipesModule,
    ReactiveFormsModule,
    SelectModule,
    SharedUiModule,
    ShoppingListsRoutingModule,
  ],
})
export class ShoppingListsModule {}
