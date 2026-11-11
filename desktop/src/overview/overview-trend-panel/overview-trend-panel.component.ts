import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from "@angular/core";
import { Router, RouterLink } from "@angular/router";
import type { ScriptableContext } from "chart.js";
import { firstValueFrom } from "rxjs";
import { marker } from "../../i18n/marker";
import { TranslatePipe } from "../../i18n/translate.pipe";
import { TranslationService } from "../../i18n/translation.service";
import { GroupOverview, OverviewService } from "../../open-api";
import { CustomCurrencyPipe } from "../../pipes/custom-currency.pipe";
import { DisplayCurrencyPipe } from "../../pipes/display-currency.pipe";
import { SnackbarService } from "../../services";
import { DisplayCurrencyService } from "../../services/display-currency.service";
import { ChartColors } from "../../shared-ui/chart/chart-colors";
import { goalLinePlugin } from "../../shared-ui/chart/chart-plugins";
import { chartFontSize } from "../../shared-ui/chart/chart-scale";
import { htmlTooltip, tooltipCard } from "../../shared-ui/chart/chart-tooltip";
import { ChartComponent, ChartSpec } from "../../shared-ui/chart/chart.component";
import { AppIconComponent } from "../../shared-ui/icon/icon.component";
import { MoneyComponent } from "../../shared-ui/money/money.component";
import { HlmButton } from "../../ui/button/lib/hlm-button";
import { downloadFile } from "../../utils/file";
import { buildTrendBars, goalLineFraction, setChartPointer } from "../overview-chart.utils";
import {
  buildMonthlyCsv,
  buildPrintHtml,
  exceedsOneYear,
  MAX_CHART_MONTHS,
  monthKeysBetween,
  PrintYear,
  shortMonthName,
  splitIntoYears,
} from "../overview-export";
import { barRange, ResolvedPeriod } from "../overview-period";

/**
 * The Dashboard's "Spending by month" panel (by day for a period under four weeks): the period's total, the bars,
 * and the monthly goal drawn across them. A bar opens the receipts of its month or day. A range over a year is
 * not drawn: the panel offers it as a PDF or a CSV instead, which it fetches a calendar year at a time.
 *
 * The page hands in the period and what it loaded for it; the bars, the goal line and the export are the panel's
 * own business: nothing else on the Dashboard reads them.
 *
 * The panel is the host element, so the page can place it with ordinary layout classes.
 */
@Component({
  selector: "section[app-overview-trend-panel]",
  standalone: true,
  imports: [AppIconComponent, ChartComponent, DisplayCurrencyPipe, HlmButton, MoneyComponent, RouterLink, TranslatePipe],
  // The export formats money like the rest of the app; the pipe is not provided at the root.
  providers: [CustomCurrencyPipe],
  templateUrl: "./overview-trend-panel.component.html",
  changeDetection: ChangeDetectionStrategy.Eager,
  host: { class: "cv-panel", "aria-labelledby": "overview-trend-title" },
})
export class OverviewTrendPanelComponent {
  private readonly translation = inject(TranslationService);
  private readonly displayCurrencyService = inject(DisplayCurrencyService);
  private readonly overviewService = inject(OverviewService);
  private readonly customCurrencyPipe = inject(CustomCurrencyPipe);
  private readonly snackbarService = inject(SnackbarService);
  private readonly router = inject(Router);

  /** What the page loaded for the period: its total and its trend, by month or by day. */
  public readonly overview = input<GroupOverview | null | undefined>();

  /** The period shown; a range over a year is offered as a report instead of bars. */
  public readonly period = input<ResolvedPeriod | undefined>();

  /** The period in words, in the footer and in the chart's label. */
  public readonly periodLabel = input.required<string>();

  /** The household's monthly goal, 0 when there is none. */
  public readonly goal = input(0);

  /** The total against the period before, in words ("8% less than September 2026"). */
  public readonly change = input<string | undefined>();

  /** Spending went up, which the pill shows in the warning colour. */
  public readonly changeIsIncrease = input(false);

  /** The household whose receipts a bar opens, and whose years the export fetches. */
  public readonly groupId = input.required<number>();

  public readonly total = computed(() => this.overview()?.total ?? 0);

  public readonly isDailyTrend = computed(() => this.overview()?.trendUnit === "DAY");

  /** The month chart splits bars at the goal; it needs a goal and a month-by-month trend. */
  public readonly goalMode = computed(() => this.goal() > 0 && this.overview()?.trendUnit === "MONTH");

  public readonly bars = computed(() => {
    const overview = this.overview();
    return overview
      ? buildTrendBars(overview.trend ?? [], overview.trendUnit ?? "MONTH", overview.from ?? "", overview.to ?? "", this.goalMode() ? this.goal() : 0)
      : [];
  });

  /** The bars drawn: at most the latest 12 months. */
  public readonly chartBars = computed(() => {
    const bars = this.bars();
    return !this.isDailyTrend() && bars.length > MAX_CHART_MONTHS ? bars.slice(-MAX_CHART_MONTHS) : bars;
  });

  public readonly averageBar = computed(() => {
    const bars = this.chartBars();
    return bars.length > 0 ? bars.reduce((sum, bar) => sum + bar.total, 0) / bars.length : 0;
  });

  /** Up to a year of months is drawn; a longer custom range is offered as a report instead. */
  public readonly rangeTooLongForChart = computed(() => {
    const period = this.period();
    return !!period && !this.isDailyTrend() && exceedsOneYear(period.from, period.to);
  });

  public readonly goalFraction = computed(() => (this.goalMode() ? goalLineFraction(this.chartBars().map((bar) => bar.total), this.goal()) : 0));

  /** The goal line is left out when the goal is higher than the tallest month: it would not fit the chart. */
  public readonly showGoalLine = computed(() => this.goalFraction() > 0 && this.goalFraction() <= 1);

  /** Months over the goal, for the legend under the chart (the red part of a bar). */
  public readonly overGoalBars = computed(() => (this.goalMode() ? this.chartBars().filter((bar) => (bar.overAmount ?? 0) > 0) : []));

  public readonly exporting = signal(false);

  /**
   * The spending bars: black by day, white at night (the foreground token, so an accent palette never tints them), red
   * above the goal. The selected month is marked by its label, bold in the foreground colour.
   */
  public readonly barsOptions = (colors: ChartColors): ChartSpec => {
    const bars = this.chartBars();
    const goalMode = this.goalMode();
    const daily = this.isDailyTrend();
    const money = (value: number) => this.displayCurrencyService.format(value);
    const base = colors.foreground;
    const isSelected = (index: number) => !!bars[index]?.isSelected;
    const hasOver = (index: number) => goalMode && (bars[index]?.overAmount ?? 0) > 0;
    // Only the top segment of a stack is rounded, at its top; the other segment and every bottom stay square.
    const dataset = (label: string, data: number[], fill: string, isTop: (index: number) => boolean) => ({
      label,
      data,
      backgroundColor: fill,
      hoverBackgroundColor: fill,
      borderWidth: 0,
      borderRadius: (context: ScriptableContext<"bar">) => (isTop(context.dataIndex) ? { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 } : 0),
      borderSkipped: false as const,
      categoryPercentage: 1,
      // Seven or more columns get narrower bars so a year fits the card.
      barPercentage: bars.length > 6 ? 0.55 : 0.38,
    });
    return {
      type: "bar",
      data: {
        labels: bars.map((bar) => this.translation.months(bar.shortName)),
        datasets: goalMode
          ? [
              dataset("Spent", bars.map((bar) => bar.baseAmount ?? 0), base, (index) => !hasOver(index)),
              dataset("Over goal", bars.map((bar) => bar.overAmount ?? 0), colors.destructive, hasOver),
            ]
          : [dataset("Spent", bars.map((bar) => bar.total), base, () => true)],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500 },
        transitions: { active: { animation: { duration: 0 } } },
        interaction: { mode: "index", intersect: false },
        // A bar opens the receipts of its month (or day).
        onHover: (event, elements) => setChartPointer(event, elements.length > 0),
        onClick: (_event, elements) => {
          if (elements.length > 0) {
            this.openBar(elements[0].index);
          }
        },
        layout: { padding: { left: 8, right: 8 } },
        scales: {
          x: {
            stacked: true,
            grid: { display: false },
            border: { color: colors.border },
            // Months are all labelled, slanted when they do not fit; the labels of up to 31 days are thinned out.
            ticks: {
              color: (context) => (isSelected(context.index) ? colors.foreground : colors.mutedForeground),
              font: (context) => ({ size: chartFontSize(12), weight: isSelected(context.index) ? "bold" : "normal" }),
              autoSkip: daily,
              autoSkipPadding: 6,
              maxRotation: daily ? 0 : 45,
            },
          },
          y: {
            stacked: true,
            beginAtZero: true,
            // Chart.js 4 takes the dash of the grid lines from the axis border.
            border: { display: false, dash: [3, 3] },
            grid: { color: colors.border, lineWidth: 1, drawTicks: false },
            ticks: { color: colors.mutedForeground, font: { size: chartFontSize(11) }, maxTicksLimit: 6, padding: 6, callback: (value) => money(Number(value)) },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: false,
            external: htmlTooltip((tooltip) => {
              const bar = bars[tooltip.dataPoints[0]?.dataIndex ?? -1];
              if (!bar) {
                return "";
              }
              const rows = [{ color: colors.foreground, label: this.translation.t("Spent"), value: money(bar.total) }];
              if (goalMode && (bar.overAmount ?? 0) > 0) {
                rows.push({ color: colors.destructive, label: this.translation.t("Over goal"), value: money(bar.overAmount ?? 0) });
              }
              return tooltipCard(this.barHeading(bar.key, bar.shortName), rows);
            }),
          },
          cvGoalLine: { value: goalMode && this.showGoalLine() ? this.goal() : 0, color: colors.mutedForeground, label: this.translation.t(marker("Goal")) },
        },
      },
      plugins: [goalLinePlugin],
    };
  };

  /** Opens the receipts of the month (or day) a bar stands for. */
  public openBar(index: number): void {
    const key = this.chartBars()[index]?.key;
    const range = key ? barRange(key) : undefined;
    if (range) {
      void this.router.navigate(["/receipts/group", this.groupId()], { queryParams: range });
    }
  }

  /**
   * "October 2026" for a month bar, "21 October 2026" for a day bar. A day is formatted by the browser in the
   * language's locale, which puts the month in the right grammatical case ("21 października 2026").
   */
  private barHeading(key: string, fallback: string): string {
    const [year, month, day] = key.split("-").map(Number);
    if (!year || !month) {
      return fallback;
    }
    if (day) {
      return new Intl.DateTimeFormat(this.translation.locale(), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
        Date.UTC(year, month - 1, day)
      );
    }
    const monthName = new Date(year, month - 1, 1).toLocaleString("en", { month: "long" });
    return this.translation.months(`${monthName} ${year}`);
  }

  /** Month totals for the whole period, fetched a calendar year at a time. */
  private async loadYears(): Promise<{ label: string; from: string; to: string; overview: GroupOverview }[]> {
    const period = this.period();
    if (!period) {
      return [];
    }

    return Promise.all(
      splitIntoYears(period.from, period.to).map(async (chunk) => ({
        ...chunk,
        overview: await firstValueFrom(this.overviewService.getGroupOverview(this.groupId(), undefined, chunk.from, chunk.to)),
      }))
    );
  }

  /** The months of one year chunk, every month listed (empty ones as 0). */
  private monthTotals(chunk: { from: string; to: string; overview: GroupOverview }): { month: string; total: number }[] {
    // A chunk under four weeks comes back as days; either way the totals are gathered by "yyyy-MM". Months
    // at the edge of a range are whole months.
    const totals = new Map<string, number>();
    for (const point of chunk.overview.trend ?? []) {
      const month = point.month.slice(0, 7);
      totals.set(month, (totals.get(month) ?? 0) + Number(point.total));
    }
    return monthKeysBetween(chunk.from, chunk.to).map((month) => ({ month, total: totals.get(month) ?? 0 }));
  }

  /** "Month, Total Spent, Goal, Difference" for the whole range, straight to a file. */
  public async exportCsv(): Promise<void> {
    if (this.exporting()) {
      return;
    }

    this.exporting.set(true);
    try {
      const years = await this.loadYears();
      const rows = years.flatMap((year) => this.monthTotals(year));
      downloadFile(
        new Blob([buildMonthlyCsv(rows, this.goal())], { type: "text/csv;charset=utf-8" }),
        `spending-${this.period()?.from}-${this.period()?.to}.csv`
      );
    } catch {
      this.snackbarService.error("The export could not be made. Try again.");
    } finally {
      this.exporting.set(false);
    }
  }

  /** A print view, one calendar year per landscape page; the browser's print dialog saves it as a PDF. */
  public async exportPdf(): Promise<void> {
    if (this.exporting()) {
      return;
    }

    // Opened now, in the click, because a window opened after the requests finish is taken for a pop-up.
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      this.snackbarService.error("Allow pop-ups for this site to print the report.");
      return;
    }
    printWindow.document.write("<p style=\"font-family:system-ui\">Preparing the report…</p>");

    this.exporting.set(true);
    try {
      const years = await this.loadYears();
      const printYears: PrintYear[] = years.map((year) => ({
        label: year.label,
        total: this.customCurrencyPipe.transform(year.overview.total),
        months: this.monthTotals(year).map((month) => ({
          name: shortMonthName(month.month),
          total: month.total,
          text: this.customCurrencyPipe.transform(month.total),
        })),
        categories: (year.overview.categories ?? []).map((category) => ({
          name: category.name,
          total: this.customCurrencyPipe.transform(category.total),
        })),
      }));

      const html = buildPrintHtml(marker("Spending by year"), this.periodLabel(), printYears);
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
    } catch {
      printWindow.close();
      this.snackbarService.error("The report could not be made. Try again.");
    } finally {
      this.exporting.set(false);
    }
  }
}
