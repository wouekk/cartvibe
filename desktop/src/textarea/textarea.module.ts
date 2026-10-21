import { TextFieldModule } from "@angular/cdk/text-field";
import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { ReactiveFormsModule } from "@angular/forms";
import { HlmTextareaImports } from "@spartan-ng/helm/textarea";
import { TextareaComponent } from "./textarea/textarea.component";

@NgModule({
  declarations: [TextareaComponent],
  imports: [CommonModule, ReactiveFormsModule, TextFieldModule, ...HlmTextareaImports],
  exports: [TextareaComponent],
})
export class TextareaModule {}
