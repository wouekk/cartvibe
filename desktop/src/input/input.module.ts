import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { ReactiveFormsModule } from "@angular/forms";
import { MatIconModule } from "@angular/material/icon";
import { MatSnackBarModule } from "@angular/material/snack-bar";
import { MatTooltipModule } from "@angular/material/tooltip";
import { NgxMaskDirective, provideNgxMask } from "ngx-mask";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmInput } from "@spartan-ng/helm/input";
import { InputComponent } from "./input/input.component";

@NgModule({
  declarations: [InputComponent],
  imports: [
    CommonModule,
    HlmButton,
    HlmInput,
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
