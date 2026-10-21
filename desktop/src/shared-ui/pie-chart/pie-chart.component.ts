import { CommonModule } from "@angular/common";
import { Component, ViewEncapsulation, input } from "@angular/core";
import { ChartConfiguration, ChartData } from "chart.js";
import { BaseChartDirective } from "ng2-charts";
import { marker } from "../../i18n/marker";
import { TranslatePipe } from "../../i18n/translate.pipe";

@Component({
  selector: "app-pie-chart-ui",
  templateUrl: "./pie-chart.component.html",
  styleUrls: ["./pie-chart.component.scss"],
  standalone: true,
  imports: [CommonModule, BaseChartDirective, TranslatePipe],
  encapsulation: ViewEncapsulation.None,
})
export class PieChartUiComponent {
  public readonly chartData = input<ChartData<"pie", number[], string>>({
    labels: [],
    datasets: [{ data: [] }],
});

  public readonly chartOptions = input<ChartConfiguration<"pie">["options"]>({
    responsive: true,
    maintainAspectRatio: false,
});

  public readonly height = input<string>("300px");

  public readonly isLoading = input<boolean>(false);

  public readonly hasData = input<boolean>(true);

  public readonly noDataMessage = input<string>(marker("No data available"));

  public readonly loadingMessage = input<string>(marker("Loading..."));
}
