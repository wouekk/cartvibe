import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import type { ScriptableContext } from "chart.js";
import { marker } from "../../i18n/marker";
import { TranslateDataPipe, TranslatePipe } from "../../i18n/translate.pipe";
import { TranslationService } from "../../i18n/translation.service";
import { GroupOverviewCategory } from "../../open-api";
import { DisplayCurrencyService } from "../../services/display-currency.service";
import { ChartColors } from "../../shared-ui/chart/chart-colors";
import { centerTextPlugin, pointerPlugin } from "../../shared-ui/chart/chart-plugins";
import { htmlTooltip, tooltipCard } from "../../shared-ui/chart/chart-tooltip";
import { ChartComponent, ChartSpec } from "../../shared-ui/chart/chart.component";
import { AppIconComponent } from "../../shared-ui/icon/icon.component";
import { MoneyComponent } from "../../shared-ui/money/money.component";
import { HlmTh, HlmTHead } from "../../ui/table/lib/hlm-table";
import { buildDonutSegments, DonutSegment, setChartPointer } from "../overview-chart.utils";

/** How far the active donut slice slides out of the ring, and how faint the other slices and legend rows go. */
const DONUT_POP_OUT_OFFSET = 8;
const DONUT_DIMMED_OPACITY = 0.45;

/** The longest text the middle of the donut shows on one line. */
const DONUT_CENTER_LABEL_MAX = 16;

/** "rgb(r, g, b)" at a lower opacity; any other form is returned as it is. */
function withAlpha(color: string, alpha: number): string {
  return color.startsWith("rgb(") ? color.replace("rgb(", "rgba(").replace(")", `, ${alpha})`) : color;
}

/**
 * The Dashboard's "Spending by category" panel: a donut and its legend, in step. Pointing at a slice or a legend
 * row emphasises that category and fades the others; a legend dot keeps a category focused until it is clicked
 * again; a click on a slice or a name asks the page to open the products behind it (`open`).
 *
 * The page hands in the period's categories and total. What is hovered and what is focused is the panel's own
 * business: nothing else on the Dashboard reads it.
 *
 * The panel is the host element, so the page can place it with ordinary layout classes.
 */
@Component({
  selector: "section[app-overview-categories-panel]",
  standalone: true,
  imports: [AppIconComponent, ChartComponent, HlmTh, HlmTHead, MoneyComponent, RouterLink, TranslateDataPipe, TranslatePipe],
  templateUrl: "./overview-categories-panel.component.html",
  changeDetection: ChangeDetectionStrategy.Eager,
  host: { class: "cv-panel", "aria-labelledby": "overview-categories-title" },
})
export class OverviewCategoriesPanelComponent {
  private readonly translation = inject(TranslationService);
  private readonly displayCurrencyService = inject(DisplayCurrencyService);

  /** What the household spent per category in the period shown. */
  public readonly categories = input.required<GroupOverviewCategory[]>();

  /** The period's whole total: the middle of the ring while no category is emphasised. */
  public readonly total = input<string | number>(0);

  /** The period in words, under the title and in the middle of the ring. */
  public readonly periodLabel = input.required<string>();

  /** A slice or a category's name was clicked: the page opens the products behind it. */
  public readonly open = output<DonutSegment>();

  public readonly segments = computed(() => buildDonutSegments(this.categories()));

  /** The category the user focused (click a slice or a legend dot); it stays until clicked again. */
  public readonly focusedSegment = signal<string | null>(null);

  /** The category under the pointer (or keyboard focus), on the ring or in the legend. */
  public readonly hoveredSegment = signal<string | null>(null);

  /** What the ring and the legend emphasise: the hovered category, else the focused one. */
  public readonly activeSegment = computed(() => this.hoveredSegment() ?? this.focusedSegment());

  /** The ring's emphasised slice, for the chart: null when no category is hovered or focused. */
  public readonly activeSegmentIndex = computed(() => {
    const index = this.segments().findIndex((segment) => segment.name === this.activeSegment());
    return index >= 0 ? index : null;
  });

  public isDimmed(name: string): boolean {
    const active = this.activeSegment();
    return active !== null && active !== name;
  }

  public toggleFocus(name: string): void {
    this.focusedSegment.update((focused) => (focused === name ? null : name));
  }

  public hoverSegment(name: string | null): void {
    this.hoveredSegment.set(name);
  }

  /**
   * The category donut (Chart.js on the theme tokens); the total, or the active category, sits in its middle. Hover is
   * not an input of this config: the middle, the fading and the slide-out read `activeSegment` when they paint, and the
   * chart wrapper repaints on `activeIndex`, so hovering never rebuilds the chart.
   */
  public readonly donutOptions = (colors: ChartColors): ChartSpec => {
    const segments = this.segments();
    const color = (index: number) => colors.series[index % colors.series.length];
    const fill = (context: ScriptableContext<"doughnut">) =>
      this.isDimmed(segments[context.dataIndex]?.name ?? "") ? withAlpha(color(context.dataIndex), DONUT_DIMMED_OPACITY) : color(context.dataIndex);
    return {
      type: "doughnut",
      data: {
        labels: segments.map((segment) => this.translation.t(segment.name)),
        datasets: [
          {
            data: segments.map((segment) => segment.total),
            backgroundColor: fill,
            hoverBackgroundColor: fill,
            borderColor: colors.card,
            hoverBorderColor: colors.card,
            borderWidth: 3,
            hoverBorderWidth: 3,
            hoverOffset: DONUT_POP_OUT_OFFSET,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "76%",
        onHover: (event, elements) => setChartPointer(event, elements.length > 0),
        // Chart.js 4.5 does not reserve the hover offset in the ring's size: the grown slice would be cut at the edge.
        layout: { padding: DONUT_POP_OUT_OFFSET },
        animation: { duration: 400 },
        transitions: { active: { animation: { duration: 200 } }, emphasis: { animation: { duration: 200 } } },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: false,
            external: htmlTooltip((tooltip) => {
              const index = tooltip.dataPoints[0]?.dataIndex ?? -1;
              const segment = segments[index];
              if (!segment) {
                return "";
              }
              return tooltipCard(this.translation.t(segment.name), [
                { color: color(index), label: this.translation.t("Spent"), value: this.displayCurrencyService.format(segment.total) },
                { color: color(index), label: this.translation.t("Share of total"), value: segment.share },
              ]);
            }),
          },
          cvCenterText: { text: () => this.centerText(this.activeSegment()), labelColor: colors.mutedForeground, valueColor: colors.foreground },
          cvPointer: {
            hover: (index) => this.hoverSegment(index === null ? null : this.segments()[index]?.name ?? null),
            click: (index) => {
              const segment = this.segments()[index];
              if (segment) {
                this.open.emit(segment);
              }
            },
            active: () => this.activeSegmentIndex(),
          },
        },
      },
      plugins: [centerTextPlugin, pointerPlugin],
    };
  };

  /** The ring's middle: the category's name and total, or the period and its total when none is given. */
  private centerText(name: string | null): { label: string; value: string } {
    const segment = this.segments().find((candidate) => candidate.name === name);
    return {
      label: this.fitCenterLabel(segment ? this.translation.t(segment.name) : this.periodLabel()),
      value: this.displayCurrencyService.format(segment ? segment.total : this.total()),
    };
  }

  /** The ring's middle is about 130 px wide: a long date range reads "Total", a long category name is cut. */
  private fitCenterLabel(text: string): string {
    if (text.length <= DONUT_CENTER_LABEL_MAX) {
      return text;
    }
    return text.includes(" – ") ? this.translation.t(marker("Total")) : `${text.slice(0, DONUT_CENTER_LABEL_MAX - 1)}…`;
  }
}
