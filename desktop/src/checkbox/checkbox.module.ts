import { PluralPipe, TranslatePipe } from "../i18n/translate.pipe";
import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { HlmCheckboxImports } from '@spartan-ng/helm/checkbox';
import { CheckboxComponent } from './checkbox/checkbox.component';
import { AppIconComponent } from "../shared-ui/icon/icon.component";
import { HlmTooltipImports } from "@spartan-ng/helm/tooltip";
import { SharedUiModule } from 'src/shared-ui/shared-ui.module';

@NgModule({
  declarations: [CheckboxComponent],
  imports: [TranslatePipe, PluralPipe, 
    CommonModule,
    ReactiveFormsModule,
    ...HlmCheckboxImports,
    AppIconComponent,
    ...HlmTooltipImports,
    SharedUiModule,
  ],
  exports: [CheckboxComponent],
})
export class CheckboxModule {}
