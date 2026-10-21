import { PluralPipe, TranslatePipe } from "../i18n/translate.pipe";
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RadioGroupComponent } from './radio-group/radio-group.component';
import { HlmRadioGroupImports } from '@spartan-ng/helm/radio-group';
import { ReactiveFormsModule } from '@angular/forms';

@NgModule({
  declarations: [RadioGroupComponent],
  imports: [TranslatePipe, PluralPipe, CommonModule, ...HlmRadioGroupImports, ReactiveFormsModule],
  exports: [RadioGroupComponent],
})
export class RadioGroupModule {}
