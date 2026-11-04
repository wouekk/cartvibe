import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AvatarComponent } from './avatar/avatar.component';
import { HlmTooltipImports } from "@spartan-ng/helm/tooltip";
import { AppIconComponent } from "../shared-ui/icon/icon.component";

@NgModule({
  declarations: [AvatarComponent],
  imports: [CommonModule, AppIconComponent, ...HlmTooltipImports],
  exports: [AvatarComponent],
})
export class AvatarModule {}
