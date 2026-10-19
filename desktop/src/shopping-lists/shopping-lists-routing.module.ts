import { NgModule } from "@angular/core";
import { RouterModule, Routes } from "@angular/router";
import { shoppingListGroupGuard } from "./guards/shopping-list-group.guard";
import { ShoppingListsPageComponent } from "./shopping-lists-page/shopping-lists-page.component";

const routes: Routes = [
  {
    path: "group/:groupId",
    component: ShoppingListsPageComponent,
    canActivate: [shoppingListGroupGuard],
  },
  {
    // No group in the URL: the guard resolves the group the header button would pick.
    path: "",
    pathMatch: "full",
    component: ShoppingListsPageComponent,
    canActivate: [shoppingListGroupGuard],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ShoppingListsRoutingModule {}
