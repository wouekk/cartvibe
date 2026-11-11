import { RowActionsComponent } from "../shared-ui/row-actions/row-actions.component";
import { CheckboxModule } from "../checkbox/checkbox.module";
import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { ReactiveFormsModule } from "@angular/forms";
import { SharedUiModule } from "src/shared-ui/shared-ui.module";
import { TableModule } from "src/table/table.module";

import { InputModule } from "../input";

import { CategoriesRoutingModule } from "./categories-routing.module";
import { CategoryForm } from "./category-form/category-form.component";
import { CategoryTableComponent } from "./category-table/category-table.component";

@NgModule({
    imports: [
    CategoriesRoutingModule,
    CheckboxModule,
    CommonModule,
    InputModule,
    ReactiveFormsModule,
    SharedUiModule,
    RowActionsComponent,
    TableModule,
    CategoryTableComponent, CategoryForm,
],
})
export class CategoriesModule {}
