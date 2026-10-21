import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { MatBadgeModule } from "@angular/material/badge";
import { AppIconComponent } from "../shared-ui/icon/icon.component";
import { MatTooltipModule } from "@angular/material/tooltip";
import { RouterModule } from "@angular/router";
import { HlmButton } from "@spartan-ng/helm/button";
import { BaseButtonComponent } from "./base-button/base-button.component";
import { ButtonComponent } from "./button/button.component";

@NgModule({
  declarations: [ButtonComponent, BaseButtonComponent],
  imports: [CommonModule, HlmButton, MatBadgeModule, AppIconComponent, MatTooltipModule, RouterModule],
  exports: [ButtonComponent],
})
export class ButtonModule {}
