import { marker } from "../../i18n/marker";

/**
 * The Dashboard layout engine: which panels show, in what order and at what size, for each screen size. Pure and
 * tested; the Dashboard renders what `resolveLayout` returns and the customise screen edits a `DashboardLayout`.
 *
 * The saved document (`GET/PUT /dashboardLayout`, a string on the API) is client-owned and versioned:
 * `{ version: 1, panels: [{ id, visible, cols, rows }], compactOrder?: [ids] }`. Panel ids are plain strings, never a
 * closed enum, and ids this version does not know are kept (a newer client's panels survive a save from an older one).
 * Sizes are in the widest grid's columns; screen sizes are named after Apple's size classes so a native app can map them.
 */

export const DASHBOARD_LAYOUT_VERSION = 1;

/** Phone (one column), tablet (four) and PC (six). */
export type SizeClass = "compact" | "regular" | "wide";

export const GRID_COLUMNS: Record<SizeClass, number> = { compact: 1, regular: 4, wide: 6 };

/** The grid's own width (not the viewport) picks the size class, so the customise preview reflows like a device. */
export function sizeClassFor(width: number): SizeClass {
  if (width < 640) {
    return "compact";
  }
  return width < 1024 ? "regular" : "wide";
}

export type PanelGroup = "kpi" | "tags" | "charts" | "lists";

export interface PanelDefinition {
  kind: string;
  group: PanelGroup;
  /** The library label; tag panels show the tag's name instead. */
  label: string;
  /** Width in the wide grid's six columns. */
  minCols: number;
  maxCols: number;
  defaultCols: number;
  /** The fewest of the tablet grid's four columns it may take (charts and tables need the whole row there). */
  minRegularCols: number;
  /** Height steps: 1 is the panel's natural height, 2 a taller one. */
  maxRows: number;
}

const kpi = (kind: string, label: string, defaultCols = 1): PanelDefinition => ({
  kind,
  group: "kpi",
  label,
  minCols: 1,
  maxCols: 2,
  defaultCols,
  minRegularCols: 1,
  maxRows: 1,
});

/**
 * Every kind of panel, in the default order. The limits keep the content whole: the donut keeps its legend beside it
 * and twelve month bars fit (three of six columns, the whole row on a tablet).
 */
export const PANEL_CATALOGUE: readonly PanelDefinition[] = [
  kpi("spent", marker("Spent"), 2),
  kpi("receipts", marker("Receipts")),
  kpi("unhealthy", marker("Unhealthy")),
  kpi("unplanned", marker("Not on the list")),
  kpi("toBuy", marker("To buy")),
  { kind: "tag", group: "tags", label: marker("Tag"), minCols: 1, maxCols: 2, defaultCols: 1, minRegularCols: 1, maxRows: 1 },
  { kind: "categories", group: "charts", label: marker("Spending by category"), minCols: 3, maxCols: 6, defaultCols: 3, minRegularCols: 4, maxRows: 2 },
  { kind: "trend", group: "charts", label: marker("Spending by month"), minCols: 3, maxCols: 6, defaultCols: 3, minRegularCols: 4, maxRows: 2 },
  { kind: "recentReceipts", group: "lists", label: marker("Recent receipts"), minCols: 3, maxCols: 6, defaultCols: 4, minRegularCols: 4, maxRows: 2 },
  { kind: "shoppingList", group: "lists", label: marker("Shopping list"), minCols: 2, maxCols: 3, defaultCols: 2, minRegularCols: 2, maxRows: 2 },
];

const TAG_PREFIX = "tag:";

export function tagPanelId(tagId: number): string {
  return `${TAG_PREFIX}${tagId}`;
}

/** The kind behind an id: "tag:12" is a tag panel, anything else is its own kind. */
export function panelKind(id: string): string {
  return id.startsWith(TAG_PREFIX) ? "tag" : id;
}

export function panelDefinition(id: string): PanelDefinition | undefined {
  const kind = panelKind(id);
  return PANEL_CATALOGUE.find((definition) => definition.kind === kind);
}

export interface PanelLayout {
  id: string;
  visible: boolean;
  /** Width in the wide grid's columns. */
  cols: number;
  rows: number;
}

export interface DashboardLayout {
  version: number;
  /** The tablet and PC order. */
  panels: PanelLayout[];
  /** The phone order, once the user has arranged the phone themselves; until then the shopping list leads. */
  compactOrder?: string[];
}

/** A panel as drawn: its id and kind, and its span in the current grid. */
export interface ResolvedPanel {
  id: string;
  kind: string;
  /** Columns in the current size class's grid. */
  span: number;
  /** Width and height as saved (wide-grid columns, height step). */
  cols: number;
  rows: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(value)));

function defaultPanel(id: string): PanelLayout | undefined {
  const definition = panelDefinition(id);
  return definition ? { id, visible: true, cols: definition.defaultCols, rows: 1 } : undefined;
}

/** Puts a panel the layout does not know yet after the last panel of its group (tags after the KPI tiles). */
function insertByGroup(panels: PanelLayout[], panel: PanelLayout): PanelLayout[] {
  const groups: PanelGroup[] = ["kpi", "tags", "charts", "lists"];
  const rank = (id: string) => groups.indexOf(panelDefinition(id)?.group ?? "lists");
  const target = rank(panel.id);
  let index = 0;
  panels.forEach((candidate, position) => {
    if (panelDefinition(candidate.id) && rank(candidate.id) <= target) {
      index = position + 1;
    }
  });
  return [...panels.slice(0, index), panel, ...panels.slice(index)];
}

/** The layout a person who never customised gets, for the panels available to them. */
export function defaultLayout(available: string[]): DashboardLayout {
  const fixed = PANEL_CATALOGUE.filter((definition) => definition.kind !== "tag").map((definition) => definition.kind);
  let panels = fixed.filter((id) => available.includes(id)).map((id) => defaultPanel(id) as PanelLayout);
  for (const id of available.filter((candidate) => panelKind(candidate) === "tag")) {
    panels = insertByGroup(panels, defaultPanel(id) as PanelLayout);
  }
  // Spent is two columns wide while it has room; with more tiles it gives the column back so a row of six fits.
  const tiles = panels.filter((panel) => isTilePanel(panel.id)).length;
  if (tiles > GRID_COLUMNS.wide - 1) {
    panels = panels.map((panel) => (panel.id === "spent" ? { ...panel, cols: 1 } : panel));
  }
  return { version: DASHBOARD_LAYOUT_VERSION, panels };
}

/** Key figures and tag tiles: small tiles, which keep to their own rows apart from charts and lists. */
export function isTilePanel(id: string): boolean {
  const group = panelDefinition(id)?.group;
  return group === "kpi" || group === "tags";
}

/** Whether a panel starts a new row: tiles and the larger panels never share one (a lone tile would stretch tall). */
export function startsNewBand(panels: ResolvedPanel[], index: number): boolean {
  return index > 0 && isTilePanel(panels[index].id) !== isTilePanel(panels[index - 1].id);
}

/** Reads a saved layout; anything unreadable (bad JSON, another version, a wrong shape) is no layout. */
export function parseLayout(text: string | null | undefined): DashboardLayout | undefined {
  if (!text) {
    return undefined;
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }

  const candidate = value as Partial<DashboardLayout> | null;
  if (!candidate || typeof candidate !== "object" || candidate.version !== DASHBOARD_LAYOUT_VERSION || !Array.isArray(candidate.panels)) {
    return undefined;
  }

  const seen = new Set<string>();
  const panels: PanelLayout[] = [];
  for (const raw of candidate.panels as unknown[]) {
    const panel = raw as Partial<PanelLayout> | null;
    if (!panel || typeof panel.id !== "string" || seen.has(panel.id)) {
      continue;
    }
    seen.add(panel.id);
    const definition = panelDefinition(panel.id);
    const cols = Number(panel.cols);
    const rows = Number(panel.rows);
    panels.push({
      id: panel.id,
      visible: panel.visible !== false,
      // A panel this version does not know keeps its numbers as they are.
      cols: definition ? clamp(Number.isFinite(cols) ? cols : definition.defaultCols, definition.minCols, definition.maxCols) : cols,
      rows: definition ? clamp(Number.isFinite(rows) ? rows : 1, 1, definition.maxRows) : rows,
    });
  }

  const compactOrder = Array.isArray(candidate.compactOrder)
    ? candidate.compactOrder.filter((id, index, all): id is string => typeof id === "string" && all.indexOf(id) === index)
    : undefined;

  return { version: DASHBOARD_LAYOUT_VERSION, panels, ...(compactOrder ? { compactOrder } : {}) };
}

export function serializeLayout(layout: DashboardLayout): string {
  return JSON.stringify(layout);
}

/**
 * The saved layout completed with what is available now: panels it does not mention (a tag an admin just put on the
 * Dashboard, a panel added in a later version) join it, visible, next to their group. Ids that are not available are
 * kept, so nothing is lost when a permission or a tag comes back.
 */
export function completeLayout(saved: DashboardLayout | undefined, available: string[]): DashboardLayout {
  if (!saved) {
    return defaultLayout(available);
  }

  let panels = saved.panels;
  for (const id of available) {
    if (!panels.some((panel) => panel.id === id)) {
      const panel = defaultPanel(id);
      if (panel) {
        panels = insertByGroup(panels, panel);
      }
    }
  }
  return { ...saved, panels };
}

/** The phone order: the saved one with newcomers appended, or the tablet order with the shopping list first. */
export function compactOrder(layout: DashboardLayout): string[] {
  const ids = layout.panels.map((panel) => panel.id);
  if (layout.compactOrder) {
    const kept = layout.compactOrder.filter((id) => ids.includes(id));
    return [...kept, ...ids.filter((id) => !kept.includes(id))];
  }
  return ids.includes("shoppingList") ? ["shoppingList", ...ids.filter((id) => id !== "shoppingList")] : ids;
}

/** Columns a panel takes in a size class's grid. */
export function spanFor(panel: PanelLayout, sizeClass: SizeClass): number {
  const definition = panelDefinition(panel.id);
  if (sizeClass === "compact" || !definition) {
    return sizeClass === "compact" ? 1 : GRID_COLUMNS[sizeClass];
  }
  if (sizeClass === "wide") {
    return clamp(panel.cols, definition.minCols, definition.maxCols);
  }
  return clamp(panel.cols, definition.minRegularCols, GRID_COLUMNS.regular);
}

/** What the Dashboard draws: the visible, available panels in the size class's order with their spans. */
export function resolveLayout(saved: DashboardLayout | undefined, available: string[], sizeClass: SizeClass): ResolvedPanel[] {
  const layout = completeLayout(saved, available);
  const order = sizeClass === "compact" ? compactOrder(layout) : layout.panels.map((panel) => panel.id);
  return order
    .map((id) => layout.panels.find((panel) => panel.id === id) as PanelLayout)
    .filter((panel) => panel.visible && available.includes(panel.id) && !!panelDefinition(panel.id))
    .map((panel) => ({ id: panel.id, kind: panelKind(panel.id), span: spanFor(panel, sizeClass), cols: panel.cols, rows: panel.rows }));
}

/** Shows or hides a panel; a panel switched on that the layout lacks joins it next to its group. */
export function setVisible(layout: DashboardLayout, id: string, visible: boolean): DashboardLayout {
  if (!layout.panels.some((panel) => panel.id === id)) {
    const panel = defaultPanel(id);
    return panel ? { ...layout, panels: insertByGroup(layout.panels, { ...panel, visible }) } : layout;
  }
  return { ...layout, panels: layout.panels.map((panel) => (panel.id === id ? { ...panel, visible } : panel)) };
}

/** Sets a panel's width (wide-grid columns) and height step, within its limits. */
export function resizePanel(layout: DashboardLayout, id: string, size: { cols?: number; rows?: number }): DashboardLayout {
  const definition = panelDefinition(id);
  if (!definition) {
    return layout;
  }
  return {
    ...layout,
    panels: layout.panels.map((panel) =>
      panel.id === id
        ? {
            ...panel,
            cols: size.cols === undefined ? panel.cols : clamp(size.cols, definition.minCols, definition.maxCols),
            rows: size.rows === undefined ? panel.rows : clamp(size.rows, 1, definition.maxRows),
          }
        : panel
    ),
  };
}

/**
 * Moves the panel `id` to where `targetId` is, in the order of the size class being arranged: the phone order (which is
 * then saved) or the shared tablet and PC order. Hidden and unavailable panels keep their places around them.
 */
export function movePanel(layout: DashboardLayout, sizeClass: SizeClass, id: string, targetId: string): DashboardLayout {
  if (id === targetId) {
    return layout;
  }

  const order = sizeClass === "compact" ? compactOrder(layout) : layout.panels.map((panel) => panel.id);
  const from = order.indexOf(id);
  const to = order.indexOf(targetId);
  if (from < 0 || to < 0) {
    return layout;
  }
  const moved = [...order];
  moved.splice(from, 1);
  moved.splice(to, 0, id);

  if (sizeClass === "compact") {
    return { ...layout, compactOrder: moved };
  }
  return { ...layout, panels: moved.map((panelId) => layout.panels.find((panel) => panel.id === panelId) as PanelLayout) };
}

/** Whether two layouts would save the same document. */
export function sameLayout(a: DashboardLayout, b: DashboardLayout): boolean {
  return serializeLayout(a) === serializeLayout(b);
}
