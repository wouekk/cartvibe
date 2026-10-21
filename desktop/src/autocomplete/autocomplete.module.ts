import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { ReactiveFormsModule } from "@angular/forms";
import { HlmAutocompleteImports } from "@spartan-ng/helm/autocomplete";
import { AppIconComponent } from "../shared-ui/icon/icon.component";
import { AutocomleteComponent } from "./autocomlete/autocomlete.component";
import { OptionDisplayPipe } from "./autocomlete/option-display.pipe";

@NgModule({
  declarations: [AutocomleteComponent, OptionDisplayPipe],
  imports: [CommonModule, ReactiveFormsModule, AppIconComponent, ...HlmAutocompleteImports],
  exports: [AutocomleteComponent],
})
export class AutocompleteModule {}
