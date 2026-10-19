import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { ReactiveFormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatMenuModule } from "@angular/material/menu";
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

@NgModule({
  declarations: [
    ShoppingListAmountFieldsComponent,
    ShoppingListComponent,
    ShoppingListFormDialogComponent,
    ShoppingListItemComponent,
    ShoppingListItemFormDialogComponent,
    ShoppingListsPageComponent,
  ],
  imports: [
    CommonModule,
    InputModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    PipesModule,
    ReactiveFormsModule,
    SelectModule,
    SharedUiModule,
    ShoppingListsRoutingModule,
  ],
})
export class ShoppingListsModule {}
