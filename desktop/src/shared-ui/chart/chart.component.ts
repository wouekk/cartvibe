import { ChangeDetectionStrategy, Component, DestroyRef, effect, ElementRef, inject, input, signal, viewChild } from "@angular/core";
import type { Chart, ChartConfiguration, ChartOptions } from "chart.js";
import { ChartColors, readChartColors } from "./chart-colors";
import { syncActive } from "./chart-plugins";
import { hideChartTooltip, removeChartTooltip } from "./chart-tooltip";

/** A Chart.js configuration for one of the two charts the Dashboard draws. */
export type ChartSpec = ChartConfiguration<"doughnut"> | ChartConfiguration<"bar">;

/**
 * A Chart.js chart on the theme tokens. `options` is a factory that receives the current theme's resolved colors; the
 * chart redraws when the factory's inputs change and recolors in place when the theme does. `activeIndex` is the
 * emphasised data point (a donut slice): it is applied without rebuilding the chart, and shows as `data-active-index`
 * on the host (a canvas has no DOM to dump, so this is what a spec reads). The library is loaded on first use, so it
 * stays out of the main bundle.
 */
@Component({
  selector: "app-chart",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="relative h-full w-full"><canvas #canvas class="cv-chart" role="img" [attr.aria-label]="label()"></canvas></div>`,
  host: { class: "block", "[attr.data-active-index]": "activeIndex()" },
})
export class ChartComponent {
  public readonly options = input.required<(colors: ChartColors) => ChartSpec>();

  public readonly label = input<string>("");

  /** Left unset for a chart with nothing to emphasise (the bars). */
  public readonly activeIndex = input<number | null | undefined>(undefined);

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>("canvas");

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Bumped when the page's theme or the motion preference changes, so the chart is redrawn with the new values. */
  private readonly theme = signal(0);

  private chart?: Chart;

  private destroyed = false;

  private rendering: Promise<void> = Promise.resolve();

  /** The theme the chart was last drawn in. */
  private drawnTheme = 0;

  private fonts?: Promise<string>;

  /** The `activeIndex` the chart shows, so an unchanged one never repaints (and never interrupts the entry animation). */
  private appliedIndex: number | null | undefined;

  constructor() {
    const bump = () => this.theme.update((n) => n + 1);
    const observer = new MutationObserver(bump);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-palette"] });
    const motion = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : undefined;
    motion?.addEventListener("change", bump);

    // Touch has no mouse-out: a tap outside the chart would leave the tooltip and the emphasis behind.
    const onOutsideTap = (event: PointerEvent) => {
      const chart = this.chart;
      if (event.pointerType === "touch" && chart && event.target !== chart.canvas) {
        chart.setActiveElements([]);
        chart.tooltip?.setActiveElements([], { x: 0, y: 0 });
        hideChartTooltip(chart);
        // The raw options: read through `chart.options`, Chart.js would call these functions as scriptable options.
        const pointer = (chart.config.options as ChartOptions | undefined)?.plugins?.cvPointer;
        pointer?.hover?.(null);
        syncActive(chart, pointer?.active?.() ?? null);
      }
    };
    document.addEventListener("pointerdown", onOutsideTap, true);

    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      observer.disconnect();
      motion?.removeEventListener("change", bump);
      document.removeEventListener("pointerdown", onOutsideTap, true);
      if (this.chart) {
        removeChartTooltip(this.chart);
        this.chart.destroy();
      }
      this.chart = undefined;
    });

    effect(() => {
      const theme = this.theme();
      const spec = this.options()(readChartColors());
      this.rendering = this.rendering.then(() => this.draw(spec, theme)).catch(() => undefined);
    });

    effect(() => {
      const index = this.activeIndex();
      this.rendering = this.rendering.then(() => this.applyActive(index));
    });
  }

  /** A canvas needs the real family list (`inherit` is not understood) and does not repaint when a web font arrives late. */
  private loadFont(): Promise<string> {
    this.fonts ??= (async () => {
      const family = getComputedStyle(this.host.nativeElement).fontFamily;
      try {
        await Promise.all([document.fonts.load(`400 12px ${family}`), document.fonts.load(`600 12px ${family}`)]);
      } catch {
        // The fallback family is drawn.
      }
      return family;
    })();
    return this.fonts;
  }

  private async draw(spec: ChartSpec, theme: number): Promise<void> {
    const { Chart } = await import("./chart-lazy");
    const family = await this.loadFont();
    if (this.destroyed) {
      return;
    }

    const themeChanged = theme !== this.drawnTheme;
    this.drawnTheme = theme;
    const calm = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const options = { ...spec.options, font: { ...spec.options?.font, family }, animation: calm ? false : spec.options?.animation } as ChartOptions;

    if (this.chart) {
      // A data change updates the chart in place and animates. A recolor (a theme change) lands at once, without
      // replaying the entry animation: a canvas holds no colors of its own, so nothing needs a rebuild.
      this.chart.data = spec.data;
      this.chart.options = options;
      this.chart.update(themeChanged ? "none" : undefined);
    } else {
      this.chart = new Chart(this.canvas().nativeElement, { ...spec, options } as ChartConfiguration);
    }
    this.appliedIndex = this.activeIndex();
    if (this.appliedIndex !== undefined) {
      syncActive(this.chart, this.appliedIndex);
    }
  }

  /** Emphasises `index` through Chart.js's active elements and repaints the faded rest, without a rebuild. */
  private applyActive(index: number | null | undefined): void {
    if (index === this.appliedIndex) {
      return;
    }
    this.appliedIndex = index;
    if (this.chart && !this.destroyed && index !== undefined) {
      syncActive(this.chart, index, true);
    }
  }
}
