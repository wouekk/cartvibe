import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AvatarComponent } from './avatar/avatar.component';
import { HlmTooltipImports } from "@spartan-ng/helm/tooltip";

@NgModule({
  declarations: [AvatarComponent],
  imports: [CommonModule, ...HlmTooltipImports],
  exports: [AvatarComponent],
})
export class AvatarModule {}
