import { PluralPipe, TranslatePipe } from "../i18n/translate.pipe";
import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { ReactiveFormsModule } from "@angular/forms";
import { AppIconComponent } from "../shared-ui/icon/icon.component";
import { HlmTooltipImports } from "@spartan-ng/helm/tooltip";
import { NgxMaskDirective, provideNgxMask } from "ngx-mask";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmInput } from "@spartan-ng/helm/input";
import { InputComponent } from "./input/input.component";

@NgModule({
  declarations: [InputComponent],
  imports: [TranslatePipe, PluralPipe, 
    CommonModule,
    HlmButton,
    HlmInput,
    AppIconComponent,
    ...HlmTooltipImports,
    NgxMaskDirective,
    ReactiveFormsModule,
  ],
  exports: [InputComponent],
  providers: [provideNgxMask()],
})
export class InputModule {}
