import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { PipesModule } from "../pipes/pipes.module";
import { MonthStepperComponent } from "../shared-ui/month-stepper/month-stepper.component";
import { SharedUiModule } from "../shared-ui/shared-ui.module";
import { OverviewPageComponent } from "./overview-page/overview-page.component";
import { OverviewRoutingModule } from "./overview-routing.module";

@NgModule({
  declarations: [OverviewPageComponent],
  imports: [CommonModule, MatIconModule, MonthStepperComponent, OverviewRoutingModule, PipesModule, SharedUiModule],
})
export class OverviewModule {}
