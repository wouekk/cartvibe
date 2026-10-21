import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { MatBadgeModule } from "@angular/material/badge";
import { MatIconModule } from "@angular/material/icon";
import { MatTooltipModule } from "@angular/material/tooltip";
import { RouterModule } from "@angular/router";
import { HlmButton } from "@spartan-ng/helm/button";
import { BaseButtonComponent } from "./base-button/base-button.component";
import { ButtonComponent } from "./button/button.component";

@NgModule({
  declarations: [ButtonComponent, BaseButtonComponent],
  imports: [CommonModule, HlmButton, MatBadgeModule, MatIconModule, MatTooltipModule, RouterModule],
  exports: [ButtonComponent],
})
export class ButtonModule {}
