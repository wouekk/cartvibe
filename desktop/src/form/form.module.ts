import { PluralPipe, TranslatePipe } from "../i18n/translate.pipe";
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseFormComponent } from './base-form/base-form.component';



@NgModule({
  declarations: [
    BaseFormComponent
  ],
  imports: [TranslatePipe, PluralPipe, 
    CommonModule
  ],
  exports: [
    BaseFormComponent
  ]
})
export class FormModule { }
