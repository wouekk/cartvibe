import { DragDropModule } from "@angular/cdk/drag-drop";
import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { HlmButton } from "@spartan-ng/helm/button";
import { AppIconComponent } from "../shared-ui/icon/icon.component";

import { SharedUiModule } from "../shared-ui/shared-ui.module";
import { CarouselComponent } from "./carousel/carousel.component";

@NgModule({
    imports: [
    CommonModule,
    DragDropModule,
    HlmButton,
    AppIconComponent,
    SharedUiModule,
    CarouselComponent,
],
    exports: [CarouselComponent],
})
export class CarouselModule {}
