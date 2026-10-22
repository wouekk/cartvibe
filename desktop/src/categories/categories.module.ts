import { CheckboxModule } from "../checkbox/checkbox.module";
import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { ReactiveFormsModule } from "@angular/forms";
import { SharedUiModule } from "src/shared-ui/shared-ui.module";
import { TableModule } from "src/table/table.module";
import { DirectivesModule } from "../directives";
import { InputModule } from "../input";
import { PipesModule } from "../pipes";
import { CategoriesRoutingModule } from "./categories-routing.module";
import { CategoryForm } from "./category-form/category-form.component";
import { CategoryTableComponent } from "./category-table/category-table.component";

@NgModule({
  declarations: [CategoryTableComponent, CategoryForm],
  imports: [
    CategoriesRoutingModule,
    CheckboxModule,
    CommonModule,
    DirectivesModule,
    InputModule,
    PipesModule,
    ReactiveFormsModule,
    SharedUiModule,
    TableModule,
  ],
})
export class CategoriesModule {}
