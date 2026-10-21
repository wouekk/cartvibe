import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { ReactiveFormsModule } from "@angular/forms";
import { MatIconModule } from "@angular/material/icon";
import { MatSnackBarModule } from "@angular/material/snack-bar";
import { MatTooltipModule } from "@angular/material/tooltip";
import { NgxMaskDirective, provideNgxMask } from "ngx-mask";
import { HlmButtonDirective } from "../ui/button/hlm-button.directive";
import { HlmInputDirective } from "../ui/input/hlm-input.directive";
import { InputComponent } from "./input/input.component";

@NgModule({
  declarations: [InputComponent],
  imports: [
    CommonModule,
    HlmButtonDirective,
    HlmInputDirective,
    MatIconModule,
    // Provides MatSnackBar for the generate-password toast (PasswordGeneratorService).
    MatSnackBarModule,
    MatTooltipModule,
    NgxMaskDirective,
    ReactiveFormsModule,
  ],
  exports: [InputComponent],
  providers: [provideNgxMask()],
})
export class InputModule {}
