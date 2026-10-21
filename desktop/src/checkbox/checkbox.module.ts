import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { HlmCheckboxImports } from '@spartan-ng/helm/checkbox';
import { CheckboxComponent } from './checkbox/checkbox.component';
import { AppIconComponent } from "../shared-ui/icon/icon.component";
import { MatTooltipModule } from '@angular/material/tooltip';
import { SharedUiModule } from 'src/shared-ui/shared-ui.module';

@NgModule({
  declarations: [CheckboxComponent],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ...HlmCheckboxImports,
    AppIconComponent,
    MatTooltipModule,
    SharedUiModule,
  ],
  exports: [CheckboxComponent],
})
export class CheckboxModule {}
