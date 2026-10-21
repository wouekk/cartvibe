import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { AppIconComponent } from "../shared-ui/icon/icon.component";
import { HlmTooltipImports } from "@spartan-ng/helm/tooltip";
import { RouterModule } from "@angular/router";
import { HlmBadge } from "@spartan-ng/helm/badge";
import { HlmButton } from "@spartan-ng/helm/button";
import { BaseButtonComponent } from "./base-button/base-button.component";
import { ButtonComponent } from "./button/button.component";

@NgModule({
  declarations: [ButtonComponent, BaseButtonComponent],
  imports: [CommonModule, HlmBadge, HlmButton, AppIconComponent, ...HlmTooltipImports, RouterModule],
  exports: [ButtonComponent],
})
export class ButtonModule {}
