import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HlmSwitchImports } from '@spartan-ng/helm/switch';

import { SlideToggleComponent } from './slide-toggle/slide-toggle.component';

@NgModule({
  declarations: [SlideToggleComponent],
  imports: [CommonModule, ...HlmSwitchImports],
  exports: [SlideToggleComponent],
})
export class SlideToggleModule {}
