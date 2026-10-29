import type { Chart, ChartType, TooltipModel } from "chart.js";

export interface TooltipRow {
  color: string;
  label: string;
  value: string;
}

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);

/** The floating tooltip: a small card on the theme tokens, a heading and one row per figure (the Flowbite look). */
export function tooltipCard(heading: string, rows: TooltipRow[]): string {
  const body = rows
    .map(
      (row) =>
        `<div class="flex items-center gap-2 px-3 py-1.5"><span class="size-2.5 rounded-full" style="background:${row.color}"></span><span class="text-muted-foreground">${escapeHtml(row.label)}</span><span class="ml-auto pl-4 font-semibold tabular-nums">${escapeHtml(row.value)}</span></div>`
    )
    .join("");
  return `<div class="min-w-40 overflow-hidden rounded-lg border border-border bg-popover text-sm text-popover-foreground shadow-lg"><div class="border-b border-border bg-muted px-3 py-1.5 font-semibold">${escapeHtml(heading)}</div>${body}</div>`;
}

const elements = new WeakMap<Chart, HTMLElement>();

function tooltipElement(chart: Chart): HTMLElement {
  let element = elements.get(chart);
  if (!element) {
    element = document.createElement("div");
    element.className = "cv-chart-tooltip";
    element.setAttribute("role", "presentation");
    element.dataset["testid"] = "chart-tooltip";
    document.body.appendChild(element);
    elements.set(chart, element);
  }
  return element;
}

/**
 * The `external` tooltip handler: draws our own HTML card, with no Chart.js chrome around it. The card sits on `<body>`
 * (position: fixed) so no card or overflow ancestor clips it, and it is clamped to the viewport so a 360px screen never
 * cuts it. `render` returns the card's HTML, or "" for no card.
 */
export function htmlTooltip<TType extends ChartType>(render: (tooltip: TooltipModel<TType>) => string) {
  return ({ chart, tooltip }: { chart: Chart; tooltip: TooltipModel<TType> }): void => {
    const element = tooltipElement(chart);
    const html = tooltip.opacity === 0 || !tooltip.dataPoints?.length ? "" : render(tooltip);
    if (!html) {
      element.style.opacity = "0";
      element.dataset["visible"] = "false";
      return;
    }

    element.innerHTML = html;
    const rect = chart.canvas.getBoundingClientRect();
    const x = rect.left + tooltip.caretX;
    const y = rect.top + tooltip.caretY;
    const margin = 8;
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    const left = Math.min(Math.max(x - width / 2, margin), document.documentElement.clientWidth - width - margin);
    const above = y - height - 12;
    element.style.left = `${Math.round(left)}px`;
    element.style.top = `${Math.round(above >= margin ? above : y + 12)}px`;
    element.style.opacity = "1";
    element.dataset["visible"] = "true";
  };
}

/** Hides the card without removing it (a touch tap outside the chart, where there is no mouse-out). */
export function hideChartTooltip(chart: Chart): void {
  const element = elements.get(chart);
  if (element) {
    element.style.opacity = "0";
    element.dataset["visible"] = "false";
  }
}

export function removeChartTooltip(chart: Chart): void {
  elements.get(chart)?.remove();
  elements.delete(chart);
}
