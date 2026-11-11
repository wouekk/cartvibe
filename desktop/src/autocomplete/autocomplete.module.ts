import { PluralPipe, TranslatePipe } from "../i18n/translate.pipe";
import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { ReactiveFormsModule } from "@angular/forms";
import { HlmAutocompleteImports } from "@spartan-ng/helm/autocomplete";
import { AppIconComponent } from "../shared-ui/icon/icon.component";
import { AutocompleteComponent } from "./autocomplete/autocomplete.component";
import { OptionDisplayPipe } from "./autocomplete/option-display.pipe";

@NgModule({
  declarations: [AutocompleteComponent, OptionDisplayPipe],
  imports: [TranslatePipe, PluralPipe, CommonModule, ReactiveFormsModule, AppIconComponent, ...HlmAutocompleteImports],
  exports: [AutocompleteComponent],
})
export class AutocompleteModule {}
