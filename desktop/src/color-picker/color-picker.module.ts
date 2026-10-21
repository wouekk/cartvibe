import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { ReactiveFormsModule } from "@angular/forms";
import { HlmInputImports } from "@spartan-ng/helm/input";
import { ColorPickerComponent } from "./color-picker/color-picker.component";

@NgModule({
  declarations: [ColorPickerComponent],
  imports: [CommonModule, ReactiveFormsModule, ...HlmInputImports],
  exports: [ColorPickerComponent],
})
export class ColorPickerModule {}
