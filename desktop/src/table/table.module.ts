import { PluralPipe, TranslatePipe } from "../i18n/translate.pipe";
import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmCheckboxImports } from "@spartan-ng/helm/checkbox";
import { HlmInputImports } from "@spartan-ng/helm/input";
import { HlmTableImports } from "@spartan-ng/helm/table";
import { ButtonModule } from "../button";
import { AppIconComponent } from "../shared-ui/icon/icon.component";
import { RowExpandablePipe } from "./table/row-expandable.pipe";
import { TableComponent } from "./table/table.component";

@NgModule({
  declarations: [TableComponent, RowExpandablePipe],
  imports: [TranslatePipe, PluralPipe, 
    CommonModule,
    AppIconComponent,
    ButtonModule,
    HlmButton,
    ...HlmCheckboxImports,
    ...HlmInputImports,
    ...HlmTableImports,
  ],
  exports: [TableComponent],
})
export class TableModule {}
