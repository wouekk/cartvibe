import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { ButtonModule } from "../button";
import { PipesModule } from "../pipes/pipes.module";
import { MonthStepperComponent } from "../shared-ui/month-stepper/month-stepper.component";
import { SharedUiModule } from "../shared-ui/shared-ui.module";
import { OverviewPageComponent } from "./overview-page/overview-page.component";
import { OverviewRoutingModule } from "./overview-routing.module";

@NgModule({
  declarations: [OverviewPageComponent],
  imports: [ButtonModule, CommonModule, MatButtonModule, MatIconModule, MonthStepperComponent, OverviewRoutingModule, PipesModule, SharedUiModule],
})
export class OverviewModule {}
