import { RowActionsComponent } from "../shared-ui/row-actions/row-actions.component";
import { CheckboxModule } from "../checkbox/checkbox.module";
import { CommonModule } from "@angular/common";
import { provideHttpClient, withInterceptorsFromDi, withXhr } from "@angular/common/http";
import { NgModule } from "@angular/core";
import { ReactiveFormsModule } from "@angular/forms";
import { SharedUiModule } from "src/shared-ui/shared-ui.module";
import { TableModule } from "src/table/table.module";

import { InputModule } from "../input";

import { TagFormComponent } from "./tag-form/tag-form.component";
import { TagTableComponent } from "./tag-table/tag-table.component";
import { TagsRoutingModule } from "./tags-routing.module";

@NgModule({ imports: [CheckboxModule,
    CommonModule,
    InputModule,
    ReactiveFormsModule,
    SharedUiModule,
    RowActionsComponent,
    TableModule,
    TagsRoutingModule, TagTableComponent, TagFormComponent], providers: [provideHttpClient(withXhr(), withInterceptorsFromDi())] })
export class TagsModule {}
