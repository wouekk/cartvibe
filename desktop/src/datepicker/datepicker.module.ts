import { PluralPipe, TranslatePipe } from "../i18n/translate.pipe";
import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { ReactiveFormsModule } from "@angular/forms";
import { HlmInputImports } from "@spartan-ng/helm/input";
import { DateInputDirective } from "./date-input.directive";
import { DatepickerComponent } from "./datepicker/datepicker.component";

@NgModule({
  declarations: [DatepickerComponent],
  imports: [TranslatePipe, PluralPipe, CommonModule, ReactiveFormsModule, DateInputDirective, ...HlmInputImports],
  exports: [DatepickerComponent],
})
export class DatepickerModule {}
