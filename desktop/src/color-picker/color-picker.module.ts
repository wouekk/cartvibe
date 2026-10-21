import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { AppIconComponent } from "../shared-ui/icon/icon.component";
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ColorPickerComponent } from './color-picker/color-picker.component';
import { ReactiveFormsModule } from '@angular/forms';

@NgModule({
  declarations: [ColorPickerComponent],
  imports: [
    CommonModule,
    MatButtonModule,
    MatFormFieldModule,
    AppIconComponent,
    MatInputModule,
    MatTooltipModule,
    MatInputModule,
    ReactiveFormsModule,
  ],
  exports: [ColorPickerComponent],
})
export class ColorPickerModule {}
