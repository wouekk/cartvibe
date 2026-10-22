import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { HlmButton } from "@spartan-ng/helm/button";
import { AppIconComponent } from "../shared-ui/icon/icon.component";
import { ButtonModule } from "../button";
import { PeriodPickerComponent } from "./period-picker/period-picker.component";
import { PipesModule } from "../pipes/pipes.module";
import { MonthStepperComponent } from "../shared-ui/month-stepper/month-stepper.component";
import { HlmCheckboxImports } from "@spartan-ng/helm/checkbox";
import { HlmTableImports } from "@spartan-ng/helm/table";
import { ApexChartComponent } from "../shared-ui/apex-chart/apex-chart.component";
import { HlmBadge } from "@spartan-ng/helm/badge";
import { DisplayCurrencyPipe } from "../pipes/display-currency.pipe";
import { MoneyComponent } from "../shared-ui/money/money.component";
import { ShopMonogramComponent } from "../shared-ui/shop-monogram/shop-monogram.component";
import { SharedUiModule } from "../shared-ui/shared-ui.module";
import { OverviewPageComponent } from "./overview-page/overview-page.component";
import { OverviewRoutingModule } from "./overview-routing.module";
import { OverviewShoppingPanelComponent } from "./overview-shopping-panel/overview-shopping-panel.component";
import { HlmDropdownMenuImports } from "@spartan-ng/helm/dropdown-menu";
import { HlmSwitchImports } from "@spartan-ng/helm/switch";

@NgModule({
  declarations: [OverviewPageComponent],
  imports: [ApexChartComponent, HlmBadge, DisplayCurrencyPipe, ...HlmCheckboxImports, ...HlmTableImports, MoneyComponent, ShopMonogramComponent, ButtonModule, CommonModule, HlmButton, AppIconComponent, MonthStepperComponent, PeriodPickerComponent, OverviewRoutingModule, PipesModule, SharedUiModule, OverviewShoppingPanelComponent, ...HlmDropdownMenuImports, ...HlmSwitchImports],
})
export class OverviewModule {}
