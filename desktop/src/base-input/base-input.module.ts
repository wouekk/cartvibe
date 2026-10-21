import { PluralPipe, TranslatePipe } from "../i18n/translate.pipe";
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseInputComponent } from './base-input/base-input.component';

@NgModule({
  declarations: [BaseInputComponent],
  imports: [TranslatePipe, PluralPipe, CommonModule],
  exports: [BaseInputComponent],
})
export class BaseInputModule {}
