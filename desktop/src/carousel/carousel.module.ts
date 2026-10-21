import { DragDropModule } from "@angular/cdk/drag-drop";
import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { AppIconComponent } from "../shared-ui/icon/icon.component";
import { PipesModule } from "src/pipes/pipes.module";
import { ButtonModule } from "../button";
import { SharedUiModule } from "../shared-ui/shared-ui.module";
import { CarouselComponent } from "./carousel/carousel.component";

@NgModule({
  declarations: [CarouselComponent],
  imports: [
    ButtonModule,
    CommonModule,
    DragDropModule,
    MatButtonModule,
    AppIconComponent,
    PipesModule,
    SharedUiModule,
  ],
  exports: [CarouselComponent],
})
export class CarouselModule {}
