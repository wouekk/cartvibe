import { ChangeDetectionStrategy, Component, DestroyRef, effect, ElementRef, inject, input, signal, viewChild } from "@angular/core";
import type ApexCharts from "apexcharts";
import type { ApexOptions } from "apexcharts";
import { ChartColors, readChartColors } from "./chart-colors";

type ApexChartInstance = ApexCharts;

/**
 * An ApexCharts chart (the engine behind Flowbite's charts) on the theme tokens. `options` is a factory that receives
 * the current theme's resolved colors; the chart redraws when the factory's inputs change and when the theme does.
 * The library is loaded on first use, so it stays out of the main bundle.
 */
@Component({
  selector: "app-apex-chart",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #host class="w-full" role="img" [attr.aria-label]="label()"></div>`,
  host: { class: "block" },
})
export class ApexChartComponent {
  public readonly options = input.required<(colors: ChartColors) => ApexOptions>();

  public readonly label = input<string>("");

  private readonly host = viewChild.required<ElementRef<HTMLElement>>("host");

  /** Bumped when the page's theme changes, so the chart is rebuilt with the new colors. */
  private readonly theme = signal(0);

  private chart?: ApexChartInstance;

  private destroyed = false;

  private rendering: Promise<void> = Promise.resolve();

  constructor() {
    const observer = new MutationObserver(() => this.theme.update((n) => n + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      observer.disconnect();
      this.chart?.destroy();
      this.chart = undefined;
    });

    effect(() => {
      this.theme();
      const options = this.options()(readChartColors());
      this.rendering = this.rendering.then(() => this.draw(options)).catch(() => undefined);
    });
  }

  private async draw(options: ApexOptions): Promise<void> {
    const { default: ApexCharts } = await import("apexcharts");
    if (this.destroyed) {
      return;
    }

    if (this.chart) {
      await this.chart.updateOptions(options, true, false);
      return;
    }

    this.chart = new ApexCharts(this.host().nativeElement, options);
    await this.chart.render();
  }
}
