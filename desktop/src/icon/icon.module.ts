import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconRegistry } from "@angular/material/icon";
import { AppIconComponent } from "../shared-ui/icon/icon.component";
import { DomSanitizer } from '@angular/platform-browser';

@NgModule({
  declarations: [],
  imports: [CommonModule, AppIconComponent],
})
export class IconModule {
  constructor(
    private matIconRegistry: MatIconRegistry,
    private domSanitizer: DomSanitizer
  ) {
    this.matIconRegistry.addSvgIcon(
      'split',
      this.domSanitizer.bypassSecurityTrustResourceUrl('../assets/split.svg')
    );
  }
}
