import { PluralPipe, TranslatePipe } from "../i18n/translate.pipe";
import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { ReactiveFormsModule } from "@angular/forms";
import { HlmInputImports } from "@spartan-ng/helm/input";
import { HlmSelectImports } from "@spartan-ng/helm/select";
import { BadgeComponent } from "src/shared-ui/badge/badge.component";
import { OptionDisplayPipe } from "./pipes/option-display.pipe";
import { ReadonlyValuePipe } from "./pipes/readonly-value.pipe";
import { SelectComponent } from "./select/select.component";

@NgModule({
    imports: [TranslatePipe, PluralPipe,
        CommonModule,
        ReactiveFormsModule,
        ...HlmInputImports,
        ...HlmSelectImports,
        // Imported directly rather than through SharedUiModule: that module imports
        // SelectModule, so going the other way round would be a circular import.
        BadgeComponent, SelectComponent, OptionDisplayPipe, ReadonlyValuePipe,],
    exports: [SelectComponent],
    providers: [OptionDisplayPipe]
})
export class SelectModule {}
