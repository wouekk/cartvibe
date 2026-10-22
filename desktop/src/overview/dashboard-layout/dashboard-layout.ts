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
  /** Where the panel sits in the wide grid (0-based column and row), once it has been placed by hand. Unplaced panels flow. */
  x?: number;
  y?: number;
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
  /** Where it is drawn in the current size class's grid: 0-based start column and row. */
  x: number;
  row: number;
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
  // Panels keep their exact widths, so the starting layout has to fill its rows itself: tiles start one column wide
  // and the room a row has left goes to its panels (Spent first) up to their limits.
  panels = panels.map((panel) => (isTilePanel(panel.id) ? { ...panel, cols: 1 } : panel));
  return { version: DASHBOARD_LAYOUT_VERSION, panels: fillRows(panels) };
}

/**
 * Packs panels into rows of the wide grid the way the Dashboard draws them (in order, a panel that does not fit starts a
 * new row) and widens the panels of each row, one column at a time, until the row is full or nothing can grow further.
 */
export function fillRows(panels: PanelLayout[]): PanelLayout[] {
  const widths = panels.map((panel) => panel.cols);
  const rows: number[][] = [];
  let used = 0;
  panels.forEach((panel, index) => {
    if (rows.length === 0 || used + widths[index] > GRID_COLUMNS.wide) {
      rows.push([]);
      used = 0;
    }
    rows[rows.length - 1].push(index);
    used += widths[index];
  });

  for (const row of rows) {
    let room = GRID_COLUMNS.wide - row.reduce((sum, index) => sum + widths[index], 0);
    let grew = true;
    while (room > 0 && grew) {
      grew = false;
      for (const index of row) {
        const max = panelDefinition(panels[index].id)?.maxCols ?? widths[index];
        if (room > 0 && widths[index] < max) {
          widths[index] += 1;
          room -= 1;
          grew = true;
        }
      }
    }
  }
  return panels.map((panel, index) => ({ ...panel, cols: widths[index] }));
}

/** Key figures and tag tiles: small tiles, which keep to their own rows apart from charts and lists. */
export function isTilePanel(id: string): boolean {
  const group = panelDefinition(id)?.group;
  return group === "kpi" || group === "tags";
}

export interface PanelRect {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The panel whose place a dragged panel takes when dropped at `point` (any direction, diagonals included): the nearest
 * other panel, by the distance from the point to its box (zero inside it, the box centre breaks ties). Empty space at the
 * end of a row or below the last row resolves to the closest panel, so a drop is never refused.
 */
export function dropTargetAt(rects: PanelRect[], point: { x: number; y: number }, draggedId: string): string | undefined {
  let best: { id: string; edge: number; centre: number } | undefined;
  for (const rect of rects) {
    if (rect.id === draggedId) {
      continue;
    }
    const dx = Math.max(rect.left - point.x, 0, point.x - (rect.left + rect.width));
    const dy = Math.max(rect.top - point.y, 0, point.y - (rect.top + rect.height));
    const edge = Math.hypot(dx, dy);
    const centre = Math.hypot(point.x - (rect.left + rect.width / 2), point.y - (rect.top + rect.height / 2));
    if (!best || edge < best.edge || (edge === best.edge && centre < best.centre)) {
      best = { id: rect.id, edge, centre };
    }
  }
  return best?.id;
}

/** Which limit stopped a requested size change, if any. */
export type SizeLimit = "min-cols" | "max-cols" | "min-rows" | "max-rows";

/** The limit a requested size runs into (the first one hit), or undefined when it fits the panel's limits. */
export function sizeLimitHit(id: string, size: { cols?: number; rows?: number }): { limit: SizeLimit; value: number } | undefined {
  const definition = panelDefinition(id);
  if (!definition) {
    return undefined;
  }
  if (size.cols !== undefined && size.cols < definition.minCols) {
    return { limit: "min-cols", value: definition.minCols };
  }
  if (size.cols !== undefined && size.cols > definition.maxCols) {
    return { limit: "max-cols", value: definition.maxCols };
  }
  if (size.rows !== undefined && size.rows < 1) {
    return { limit: "min-rows", value: 1 };
  }
  if (size.rows !== undefined && size.rows > definition.maxRows) {
    return { limit: "max-rows", value: definition.maxRows };
  }
  return undefined;
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
    const x = Number(panel.x);
    const y = Number(panel.y);
    panels.push({
      id: panel.id,
      visible: panel.visible !== false,
      // A panel this version does not know keeps its numbers as they are.
      cols: definition ? clamp(Number.isFinite(cols) ? cols : definition.defaultCols, definition.minCols, definition.maxCols) : cols,
      rows: definition ? clamp(Number.isFinite(rows) ? rows : 1, 1, definition.maxRows) : rows,
      ...(panel.x !== undefined && panel.y !== undefined && Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 ? { x, y } : {}),
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

/** A panel's place in a grid: start column and row, both 0-based. */
export interface Placement {
  id: string;
  x: number;
  row: number;
  span: number;
}

/**
 * Places panels in a grid of `columns` columns, in order. A panel with a saved cell (`x`, `y`, wide grid only) takes it when the
 * cells are free; every other panel, and one whose cell is taken, goes to the first free spot after the previous one. Rows
 * are numbered without gaps, so an empty row leaves no space.
 */
export function placePanels(
  panels: { id: string; span: number; x?: number; y?: number }[],
  columns: number,
  usePlaces: boolean
): Placement[] {
  const taken = new Map<number, boolean[]>();
  const rowCells = (row: number) => {
    if (!taken.has(row)) {
      taken.set(row, new Array(columns).fill(false));
    }
    return taken.get(row) as boolean[];
  };
  const isFree = (row: number, x: number, span: number) => {
    const cells = rowCells(row);
    return x >= 0 && x + span <= columns && cells.slice(x, x + span).every((cell) => !cell);
  };

  let cursorRow = 0;
  let cursorX = 0;
  const raw: { id: string; x: number; y: number; span: number }[] = [];
  for (const panel of panels) {
    const span = Math.min(panel.span, columns);
    let spot: { x: number; y: number } | undefined;
    if (usePlaces && panel.x !== undefined && panel.y !== undefined && isFree(panel.y, panel.x, span)) {
      spot = { x: panel.x, y: panel.y };
    }
    for (let row = cursorRow; !spot; row++) {
      for (let x = row === cursorRow ? cursorX : 0; x + span <= columns; x++) {
        if (isFree(row, x, span)) {
          spot = { x, y: row };
          break;
        }
      }
    }
    rowCells(spot.y).fill(true, spot.x, spot.x + span);
    raw.push({ id: panel.id, x: spot.x, y: spot.y, span });
    if (spot.y > cursorRow || (spot.y === cursorRow && spot.x + span > cursorX)) {
      cursorRow = spot.y;
      cursorX = spot.x + span;
    }
  }

  const rowRank = new Map([...new Set(raw.map((item) => item.y))].sort((a, b) => a - b).map((y, rank) => [y, rank]));
  return raw.map((item) => ({ id: item.id, x: item.x, row: rowRank.get(item.y) as number, span: item.span }));
}

/** What the Dashboard draws: the visible, available panels in the size class's order with their spans and places. */
export function resolveLayout(saved: DashboardLayout | undefined, available: string[], sizeClass: SizeClass): ResolvedPanel[] {
  const layout = completeLayout(saved, available);
  const order = sizeClass === "compact" ? compactOrder(layout) : layout.panels.map((panel) => panel.id);
  const shown = order
    .map((id) => layout.panels.find((panel) => panel.id === id) as PanelLayout)
    .filter((panel) => panel.visible && available.includes(panel.id) && !!panelDefinition(panel.id));
  const placed = placePanels(
    shown.map((panel) => ({ id: panel.id, span: spanFor(panel, sizeClass), x: panel.x, y: panel.y })),
    GRID_COLUMNS[sizeClass],
    sizeClass === "wide"
  );
  return shown.map((panel, index) => ({
    id: panel.id,
    kind: panelKind(panel.id),
    span: placed[index].span,
    cols: panel.cols,
    rows: panel.rows,
    x: placed[index].x,
    row: placed[index].row,
  }));
}

/** Saves where every shown panel is now, so editing one panel never makes the others move. */
export function pinPlacements(layout: DashboardLayout, placements: Placement[]): DashboardLayout {
  const byId = new Map(placements.map((place) => [place.id, place]));
  return {
    ...layout,
    panels: layout.panels.map((panel) => {
      const place = byId.get(panel.id);
      return place ? { ...panel, x: place.x, y: place.row } : panel;
    }),
  };
}

export interface DropCell {
  x: number;
  row: number;
  /** The drop opens a new row at `row` (the rows from there move down) instead of using a free spot in it. */
  newRow: boolean;
}

/**
 * Where a panel dropped near cell (`row`, `x`) of the wide grid ends up: that spot when it is free, else the nearest free
 * spot in the row, else a new row below it. Below the last row it opens a new last row.
 */
export function resolveDrop(placements: Placement[], id: string, span: number, row: number, x: number, columns = GRID_COLUMNS.wide): DropCell {
  const others = placements.filter((place) => place.id !== id);
  const rows = Math.max(-1, ...others.map((place) => place.row)) + 1;
  const start = Math.min(Math.max(x, 0), columns - span);
  if (row >= rows) {
    return { x: start, row: rows, newRow: false };
  }
  const free = (candidate: number) =>
    candidate >= 0 &&
    candidate + span <= columns &&
    others.every((place) => place.row !== row || candidate + span <= place.x || candidate >= place.x + place.span);
  for (let offset = 0; offset < columns; offset++) {
    for (const candidate of offset === 0 ? [start] : [start - offset, start + offset]) {
      if (free(candidate)) {
        return { x: candidate, row: Math.max(row, 0), newRow: false };
      }
    }
  }
  return { x: start, row: Math.max(row, 0) + 1, newRow: true };
}

/** Moves a panel to a cell of the wide grid (see `resolveDrop`); every panel is pinned where it is, and the order follows the grid. */
export function applyDrop(layout: DashboardLayout, placements: Placement[], id: string, cell: DropCell): DashboardLayout {
  const place = new Map(placements.map((item) => [item.id, { x: item.x, y: item.row }]));
  if (cell.newRow) {
    for (const [other, spot] of place) {
      if (other !== id && spot.y >= cell.row) {
        place.set(other, { x: spot.x, y: spot.y + 1 });
      }
    }
  }
  place.set(id, { x: cell.x, y: cell.row });

  const gridOrder = [...place.entries()].sort((a, b) => a[1].y - b[1].y || a[1].x - b[1].x).map(([panelId]) => panelId);
  const placed = gridOrder.map((panelId) => {
    const panel = layout.panels.find((candidate) => candidate.id === panelId) as PanelLayout;
    const spot = place.get(panelId) as { x: number; y: number };
    return { ...panel, x: spot.x, y: spot.y };
  });
  return { ...layout, panels: [...placed, ...layout.panels.filter((panel) => !place.has(panel.id))] };
}

/** The widest a panel may be where it stands: up to the next panel in its row, or the grid's edge. */
export function roomToTheRight(placements: Placement[], id: string, columns = GRID_COLUMNS.wide): number {
  const own = placements.find((place) => place.id === id);
  if (!own) {
    return 0;
  }
  const next = placements.filter((place) => place.id !== id && place.row === own.row && place.x >= own.x + own.span).map((place) => place.x);
  return Math.min(columns, ...next) - own.x;
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
