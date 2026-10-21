import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { AppIconComponent } from "../shared-ui/icon/icon.component";
import { ButtonModule } from "../button";
import { PeriodPickerComponent } from "./period-picker/period-picker.component";
import { PipesModule } from "../pipes/pipes.module";
import { MonthStepperComponent } from "../shared-ui/month-stepper/month-stepper.component";
import { ApexChartComponent } from "../shared-ui/apex-chart/apex-chart.component";
import { SharedUiModule } from "../shared-ui/shared-ui.module";
import { OverviewPageComponent } from "./overview-page/overview-page.component";
import { OverviewRoutingModule } from "./overview-routing.module";

@NgModule({
  declarations: [OverviewPageComponent],
  imports: [ApexChartComponent, ButtonModule, CommonModule, MatButtonModule, AppIconComponent, MonthStepperComponent, PeriodPickerComponent, OverviewRoutingModule, PipesModule, SharedUiModule],
})
export class OverviewModule {}
