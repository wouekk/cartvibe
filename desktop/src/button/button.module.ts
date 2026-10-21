import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { MatBadgeModule } from "@angular/material/badge";
import { MatIconModule } from "@angular/material/icon";
import { HlmButtonDirective } from "../ui/button/hlm-button.directive";
import { MatTooltipModule } from "@angular/material/tooltip";
import { RouterModule } from "@angular/router";
import { BaseButtonComponent } from "./base-button/base-button.component";
import { ButtonComponent } from "./button/button.component";

@NgModule({
  declarations: [ButtonComponent, BaseButtonComponent],
  imports: [
    CommonModule,
    MatBadgeModule,
    HlmButtonDirective,
    MatIconModule,
    MatTooltipModule,
    RouterModule,
  ],
  exports: [ButtonComponent],
})
export class ButtonModule {}
