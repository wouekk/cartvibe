import { marker } from "../../i18n/marker";

/**
 * The Dashboard layout engine: which panels show, where and at what size, for each screen size. Pure and tested; the
 * Dashboard renders what `resolveLayout` returns and the customise screen edits a `DashboardLayout`.
 *
 * The saved document (`GET/PUT /dashboardLayout`, a string on the API) is client-owned and versioned:
 * `{ version: 2, panels: [{ id, visible, cols, rows, x?, y? }], compactOrder?: [ids] }`. Panel ids are plain strings,
 * never a closed enum, and ids this version does not know are kept (a newer client's panels survive a save from an
 * older one). Sizes and cells are in the widest grid: `cols` of its six columns, `rows` of its rows (one row is
 * `GRID_ROW_REM` tall), `x` and `y` the cell of the top left corner. Screen sizes are named after Apple's size classes
 * so a native app can map them.
 *
 * Version 1 had two height steps and numbered whole rows of panels; `parseLayout` still reads it.
 */

export const DASHBOARD_LAYOUT_VERSION = 2;

/** Phone (one column), tablet (four) and PC (six). */
export type SizeClass = "compact" | "regular" | "wide";

export const GRID_COLUMNS: Record<SizeClass, number> = { compact: 1, regular: 4, wide: 6 };

/** One row of the PC grid, and the gap between rows and columns, in rem. A panel `rows` rows tall spans the gaps too. */
export const GRID_ROW_REM = 4.25;
export const GRID_GAP_REM = 1;

/** How tall a panel of `rows` rows is at least, as a CSS length. */
export function panelHeight(rows: number): string {
  return `${rows * GRID_ROW_REM + (rows - 1) * GRID_GAP_REM}rem`;
}

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
  /** Height in rows of the wide grid. The least is what the content needs, so a panel is never cut. */
  minRows: number;
  maxRows: number;
  defaultRows: number;
}

/** A tile may be as tall as a chart at its usual height, so one that stands beside a chart can fill the room under it. */
const TILE_MAX_ROWS = 6;

const kpi = (kind: string, label: string, defaultCols = 1): PanelDefinition => ({
  kind,
  group: "kpi",
  label,
  minCols: 1,
  maxCols: 2,
  defaultCols,
  minRegularCols: 1,
  minRows: 2,
  maxRows: TILE_MAX_ROWS,
  defaultRows: 2,
});

/** The tallest a chart, list or table may be made. */
const MAX_ROWS = 12;

/**
 * Every kind of panel, in the default order. The limits keep the content whole: the donut keeps its legend beside it
 * and twelve month bars fit (three of six columns, the whole row on a tablet); a key figure needs two rows, a chart six.
 */
export const PANEL_CATALOGUE: readonly PanelDefinition[] = [
  kpi("spent", marker("Spent"), 2),
  kpi("receipts", marker("Receipts")),
  kpi("unhealthy", marker("Unhealthy")),
  kpi("unplanned", marker("Not on the list")),
  kpi("toBuy", marker("To buy")),
  kpi("warranties", marker("Warranties")),
  { kind: "tag", group: "tags", label: marker("Tag"), minCols: 1, maxCols: 2, defaultCols: 1, minRegularCols: 1, minRows: 2, maxRows: TILE_MAX_ROWS, defaultRows: 2 },
  { kind: "categories", group: "charts", label: marker("Spending by category"), minCols: 3, maxCols: 6, defaultCols: 3, minRegularCols: 4, minRows: 6, maxRows: MAX_ROWS, defaultRows: 6 },
  { kind: "trend", group: "charts", label: marker("Spending by month"), minCols: 3, maxCols: 6, defaultCols: 3, minRegularCols: 4, minRows: 6, maxRows: MAX_ROWS, defaultRows: 6 },
  { kind: "recentReceipts", group: "lists", label: marker("Recent receipts"), minCols: 3, maxCols: 6, defaultCols: 4, minRegularCols: 4, minRows: 4, maxRows: MAX_ROWS, defaultRows: 5 },
  { kind: "shoppingList", group: "lists", label: marker("Shopping list"), minCols: 2, maxCols: 3, defaultCols: 2, minRegularCols: 2, minRows: 5, maxRows: MAX_ROWS, defaultRows: 5 },
  { kind: "warrantiesEndingSoon", group: "lists", label: marker("Warranties ending soon"), minCols: 2, maxCols: 6, defaultCols: 3, minRegularCols: 4, minRows: 3, maxRows: MAX_ROWS, defaultRows: 3 },
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
  /** Height in the wide grid's rows. */
  rows: number;
  /** Where the panel's top left corner sits in the wide grid (0-based column and row), once it has been placed by hand. Unplaced panels flow. */
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

/** A panel's place in a grid: its top left cell (both 0-based), its width in columns and its height in rows. */
export interface Placement {
  id: string;
  x: number;
  row: number;
  span: number;
  height: number;
}

/** A panel as drawn: its id and kind, and its place in the current size class's grid. */
export interface ResolvedPanel extends Placement {
  kind: string;
  /** Width and height as saved (wide-grid columns and rows). */
  cols: number;
  rows: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(value)));

function defaultPanel(id: string): PanelLayout | undefined {
  const definition = panelDefinition(id);
  return definition ? { id, visible: true, cols: definition.defaultCols, rows: definition.defaultRows } : undefined;
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

/** Packs panels into rows of the wide grid in order (a panel that does not fit starts a new row): the indexes of each row's panels. */
function flowRows(panels: PanelLayout[]): number[][] {
  const rows: number[][] = [];
  let used = 0;
  panels.forEach((panel, index) => {
    if (rows.length === 0 || used + panel.cols > GRID_COLUMNS.wide) {
      rows.push([]);
      used = 0;
    }
    rows[rows.length - 1].push(index);
    used += panel.cols;
  });
  return rows;
}

/** Makes the panels of each group as tall as the tallest of them, as far as each one's limit allows: a row with no holes under its shorter panels. */
function levelHeights(panels: PanelLayout[], groups: number[][]): PanelLayout[] {
  const heights = panels.map((panel) => panel.rows);
  for (const group of groups) {
    const tallest = Math.max(...group.map((index) => panels[index].rows));
    for (const index of group) {
      heights[index] = Math.min(panelDefinition(panels[index].id)?.maxRows ?? panels[index].rows, tallest);
    }
  }
  return panels.map((panel, index) => ({ ...panel, rows: heights[index] }));
}

/**
 * Packs panels into rows of the wide grid (in order, a panel that does not fit starts a new row) and fills each row:
 * its panels are widened, one column at a time, until the row is full or nothing can grow further, and made as tall
 * as the tallest of them (a tile beside a chart).
 */
export function fillRows(panels: PanelLayout[]): PanelLayout[] {
  const widths = panels.map((panel) => panel.cols);
  const rows = flowRows(panels);

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
  return levelHeights(
    panels.map((panel, index) => ({ ...panel, cols: widths[index] })),
    rows
  );
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
 * end of a row or below the last row resolves to the closest panel, so a drop is never refused. For the phone and
 * tablet views, where panels are in an order; the PC view places by cell (`makeRoom`).
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
  if (size.rows !== undefined && size.rows < definition.minRows) {
    return { limit: "min-rows", value: definition.minRows };
  }
  if (size.rows !== undefined && size.rows > definition.maxRows) {
    return { limit: "max-rows", value: definition.maxRows };
  }
  return undefined;
}

/** What the taller of version 1's two height steps was, in rows (its 34rem). */
const VERSION_1_TALL_ROWS = 7;

/**
 * Reads a saved layout; anything unreadable (bad JSON, an unknown version, a wrong shape) is no layout. A version 1
 * document is brought to today's: its two height steps become rows, and its whole rows of panels become cells.
 */
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
  if (!candidate || typeof candidate !== "object" || (candidate.version !== 1 && candidate.version !== DASHBOARD_LAYOUT_VERSION) || !Array.isArray(candidate.panels)) {
    return undefined;
  }
  const older = candidate.version === 1;

  const seen = new Set<string>();
  let panels: PanelLayout[] = [];
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
    // A panel this version does not know keeps its numbers as they are.
    let height = rows;
    if (definition && older) {
      height = rows >= 2 ? clamp(Math.max(definition.defaultRows, VERSION_1_TALL_ROWS), definition.minRows, definition.maxRows) : definition.defaultRows;
    } else if (definition) {
      height = clamp(Number.isFinite(rows) ? rows : definition.defaultRows, definition.minRows, definition.maxRows);
    }
    panels.push({
      id: panel.id,
      visible: panel.visible !== false,
      cols: definition ? clamp(Number.isFinite(cols) ? cols : definition.defaultCols, definition.minCols, definition.maxCols) : cols,
      rows: height,
      ...(panel.x !== undefined && panel.y !== undefined && Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 ? { x, y } : {}),
    });
  }

  if (older) {
    // The panels of a row stretched to the tallest of them, and a row of panels was one number: the panels of a row
    // get one height, and each row starts where the rows before it end.
    const shown = (panel: PanelLayout) => panel.visible && !!panelDefinition(panel.id);
    const index = new Map(panels.map((panel, position) => [panel.id, position]));
    const placed = panels.filter((panel) => panel.y !== undefined && shown(panel));
    const ranks = [...new Set(placed.map((panel) => panel.y as number))].sort((a, b) => a - b);
    if (ranks.length > 0) {
      panels = levelHeights(
        panels,
        ranks.map((rank) => placed.filter((panel) => panel.y === rank).map((panel) => index.get(panel.id) as number))
      );
      const tops = new Map<number, number>();
      let top = 0;
      for (const rank of ranks) {
        tops.set(rank, top);
        top += Math.max(...panels.filter((panel) => panel.y === rank && shown(panel)).map((panel) => panel.rows));
      }
      panels = panels.map((panel) => (panel.y !== undefined && tops.has(panel.y) ? { ...panel, y: tops.get(panel.y) } : panel));
    } else {
      // Never arranged in the PC view: the panels flow, so their rows are the ones they pack into.
      const flowing = panels.filter(shown);
      const levelled = levelHeights(flowing, flowRows(flowing));
      panels = panels.map((panel) => levelled.find((candidate) => candidate.id === panel.id) ?? panel);
    }
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

const overlaps = (a: Placement, b: Placement) => a.x < b.x + b.span && b.x < a.x + a.span && a.row < b.row + b.height && b.row < a.row + a.height;

/**
 * Lets every panel float up as far as it can go, top row first, as a dashboard editor does: no panel hangs below free
 * space of its own width. Panels that were given the same cells are moved apart on the way.
 */
export function compact(placements: Placement[]): Placement[] {
  const settled: Placement[] = [];
  for (const item of [...placements].sort((a, b) => a.row - b.row || a.x - b.x)) {
    const fits = (row: number) => settled.every((other) => !overlaps({ ...item, row }, other));
    let row = Math.max(0, item.row);
    while (!fits(row)) {
      row++;
    }
    while (row > 0 && fits(row - 1)) {
      row--;
    }
    settled.push({ ...item, row });
  }
  return placements.map((place) => settled.find((item) => item.id === place.id) as Placement);
}

/**
 * Places panels in a grid of `columns` columns, in order. With `usePlaces` (the PC grid) a panel with a saved cell takes
 * it when the cells are free, every other panel goes to the first free spot after the previous one, heights count, and
 * at the end everything floats up (`compact`). Without it (phone and tablet) panels flow in whole rows, one row each,
 * numbered without gaps: their heights are their content's there.
 */
export function placePanels(
  panels: { id: string; span: number; height?: number; x?: number; y?: number }[],
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
  const isFree = (row: number, x: number, span: number, height: number) => {
    if (x < 0 || x + span > columns) {
      return false;
    }
    for (let line = row; line < row + height; line++) {
      if (!rowCells(line).slice(x, x + span).every((cell) => !cell)) {
        return false;
      }
    }
    return true;
  };

  let cursorRow = 0;
  let cursorX = 0;
  const placed: Placement[] = [];
  for (const panel of panels) {
    const span = Math.min(panel.span, columns);
    const height = usePlaces ? Math.max(1, panel.height ?? 1) : 1;
    let spot: { x: number; y: number } | undefined;
    if (usePlaces && panel.x !== undefined && panel.y !== undefined && isFree(panel.y, panel.x, span, height)) {
      spot = { x: panel.x, y: panel.y };
    }
    for (let row = cursorRow; !spot; row++) {
      for (let x = row === cursorRow ? cursorX : 0; x + span <= columns; x++) {
        if (isFree(row, x, span, height)) {
          spot = { x, y: row };
          break;
        }
      }
    }
    for (let line = spot.y; line < spot.y + height; line++) {
      rowCells(line).fill(true, spot.x, spot.x + span);
    }
    placed.push({ id: panel.id, x: spot.x, row: spot.y, span, height });
    if (spot.y > cursorRow || (spot.y === cursorRow && spot.x + span > cursorX)) {
      cursorRow = spot.y;
      cursorX = spot.x + span;
    }
  }

  if (usePlaces) {
    return compact(placed);
  }
  const rowRank = new Map([...new Set(placed.map((item) => item.row))].sort((a, b) => a - b).map((row, rank) => [row, rank]));
  return placed.map((item) => ({ ...item, row: rowRank.get(item.row) as number }));
}

/** What the Dashboard draws: the visible, available panels in the size class's order with their places. */
export function resolveLayout(saved: DashboardLayout | undefined, available: string[], sizeClass: SizeClass): ResolvedPanel[] {
  const layout = completeLayout(saved, available);
  const order = sizeClass === "compact" ? compactOrder(layout) : layout.panels.map((panel) => panel.id);
  const shown = order
    .map((id) => layout.panels.find((panel) => panel.id === id) as PanelLayout)
    .filter((panel) => panel.visible && available.includes(panel.id) && !!panelDefinition(panel.id));
  const placed = placePanels(
    shown.map((panel) => ({ id: panel.id, span: spanFor(panel, sizeClass), height: panel.rows, x: panel.x, y: panel.y })),
    GRID_COLUMNS[sizeClass],
    sizeClass === "wide"
  );
  return shown.map((panel, index) => ({ ...placed[index], kind: panelKind(panel.id), cols: panel.cols, rows: panel.rows }));
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

export interface RoomOptions {
  columns?: number;
  /** The panel's new height in rows (a resize); without it the height it has. */
  height?: number;
  /**
   * Where the middle of the panel is, in columns. The panels of its row whose own middle lies before it end up on its
   * left, the others on its right. Without it: the middle of the cell the panel takes.
   */
  centre?: number;
  /** A resize: the panel stays exactly where it is and only the others give way. */
  fixed?: boolean;
}

const spanSum = (panels: Placement[]) => panels.reduce((total, panel) => total + panel.span, 0);

/**
 * Puts panel `id` at cell (`row`, `x`) of the grid, `span` columns wide, and moves the others out of its way, as a
 * dashboard editor does. The panel gets the cell it was put on; for the panels it lands on, the first rule that
 * applies:
 *
 * 1. They are its neighbours in a row of panels (same top row, same height) and that row has room for everyone: they
 *    slide aside, the ones before the panel to the left, the others to the right, each as little as needed. Moving a
 *    tile along its row is always this, so two neighbours change places.
 * 2. They fit the place the panel came from: they go there (a swap).
 * 3. A panel fits right above the moved one: it goes there (the two change places top to bottom).
 * 4. Otherwise they are pushed down below it, and whatever they land on is pushed down in turn.
 *
 * Then every panel floats up as far as it can (`compact`), the moved one included: a panel put into empty space comes
 * to rest under the panels above it. Returns every panel's place, in the order they were given.
 */
export function makeRoom(placements: Placement[], id: string, span: number, row: number, x: number, options: RoomOptions = {}): Placement[] {
  const columns = options.columns ?? GRID_COLUMNS.wide;
  const origin = placements.find((place) => place.id === id);
  const others = placements.filter((place) => place.id !== id).map((place) => ({ ...place }));
  const width = Math.min(Math.max(1, Math.round(span)), columns);
  const own: Placement = {
    id,
    x: clamp(x, 0, columns - width),
    row: Math.max(0, Math.round(row)),
    span: width,
    height: Math.max(1, Math.round(options.height ?? origin?.height ?? 1)),
  };
  const hit = others.filter((place) => overlaps(own, place)).sort((a, b) => a.row - b.row || a.x - b.x);

  if (hit.length > 0 && !slideAlongRow(own, others, hit, origin, columns, options) && !swapWithOrigin(own, hit, origin, options)) {
    for (const place of hit) {
      const above = { ...place, row: own.row - place.height };
      if (!options.fixed && above.row >= 0 && others.every((other) => other === place || !overlaps(above, other))) {
        place.row = above.row;
      } else {
        pushDown(place, own.row + own.height, others, 0);
      }
    }
  }

  const settled = new Map(compact([...others, own]).map((place) => [place.id, place]));
  const order = origin ? placements.map((place) => place.id) : [...placements.map((place) => place.id), id];
  return order.map((panelId) => settled.get(panelId) as Placement);
}

/** Rule 1 of `makeRoom`. Moves the row's panels and the panel itself (`own.x`), and says whether it applied. */
function slideAlongRow(own: Placement, others: Placement[], hit: Placement[], origin: Placement | undefined, columns: number, options: RoomOptions): boolean {
  const inBand = (place: Placement) => place.row === own.row && place.height === own.height;
  if (!hit.every(inBand)) {
    return false;
  }

  // The stretch of the row that is these panels' own: up to the grid's edges, or to a taller or lower panel that reaches into it.
  const blocked = new Array(columns).fill(false);
  for (const place of others) {
    if (!inBand(place) && place.row < own.row + own.height && own.row < place.row + place.height) {
      blocked.fill(true, place.x, place.x + place.span);
    }
  }
  let from = own.x;
  while (from > 0 && !blocked[from - 1]) {
    from--;
  }
  let to = own.x + own.span;
  while (to < columns && !blocked[to]) {
    to++;
  }

  const band = others.filter((place) => inBand(place) && place.x >= from && place.x + place.span <= to).sort((a, b) => a.x - b.x);
  const centre = options.centre ?? own.x + own.span / 2;
  const movedAlongRow = origin && origin.row === own.row && origin.height === own.height ? origin : undefined;
  const isBefore = (place: Placement) => {
    const middle = place.x + place.span / 2;
    // A panel whose middle the moved one covers steps back to the side the moved panel came from, so a wide panel
    // changes places with a narrow neighbour as well as the other way round. A caller that names the centre decides.
    const under = options.centre === undefined ? middle > own.x && middle < own.x + own.span : middle === centre;
    return under && movedAlongRow ? movedAlongRow.x < place.x : middle < centre;
  };
  const before = band.filter(isBefore);
  const after = band.filter((place) => !isBefore(place));

  const everyoneFits = spanSum(band) + own.span <= to - from;
  const fitsWhereItIs = from + spanSum(before) <= own.x && own.x + own.span + spanSum(after) <= to;
  if (!everyoneFits || (options.fixed && !fitsWhereItIs)) {
    return false;
  }

  if (!options.fixed) {
    own.x = Math.min(Math.max(own.x, from + spanSum(before)), to - own.span - spanSum(after));
  }
  let limit = own.x;
  for (const place of [...before].reverse()) {
    place.x = Math.min(place.x, limit - place.span);
    limit = place.x;
  }
  limit = own.x + own.span;
  for (const place of after) {
    place.x = Math.max(place.x, limit);
    limit = place.x + place.span;
  }
  return true;
}

/**
 * Rule 2 of `makeRoom`: the panels the moved one lands on take the place it came from, side by side, when they fit
 * there: in the corner of that place that the moved panel no longer covers (it may have moved by less than its size).
 */
function swapWithOrigin(own: Placement, hit: Placement[], origin: Placement | undefined, options: RoomOptions): boolean {
  const width = spanSum(hit);
  const tallest = Math.max(...hit.map((place) => place.height));
  if (!origin || options.fixed || width > origin.span || tallest > origin.height) {
    return false;
  }
  for (const row of [origin.row, origin.row + origin.height - tallest]) {
    for (const x of [origin.x, origin.x + origin.span - width]) {
      if (overlaps({ id: "", x, row, span: width, height: tallest }, own)) {
        continue;
      }
      let at = x;
      for (const place of [...hit].sort((a, b) => a.x - b.x)) {
        place.row = row;
        place.x = at;
        at += place.span;
      }
      return true;
    }
  }
  return false;
}

/** Rule 4 of `makeRoom`: moves a panel down to `row` and pushes whatever it then lands on below it, and so on. */
function pushDown(place: Placement, row: number, others: Placement[], depth: number): void {
  place.row = row;
  if (depth > others.length) {
    return; // `compact` moves apart whatever is left overlapping.
  }
  for (const other of others) {
    if (other !== place && overlaps(place, other)) {
      pushDown(other, place.row + place.height, others, depth + 1);
    }
  }
}

/** Saves a whole arrangement of the wide grid: every panel in it pinned to its cell, and the order following the grid. */
export function applyPlacements(layout: DashboardLayout, placements: Placement[]): DashboardLayout {
  const place = new Map(placements.map((item) => [item.id, item]));
  const gridOrder = [...placements].sort((a, b) => a.row - b.row || a.x - b.x).map((item) => item.id);
  const placed = gridOrder
    .map((panelId) => layout.panels.find((candidate) => candidate.id === panelId))
    .filter((panel): panel is PanelLayout => !!panel)
    .map((panel) => ({ ...panel, x: (place.get(panel.id) as Placement).x, y: (place.get(panel.id) as Placement).row }));
  return { ...layout, panels: [...placed, ...layout.panels.filter((panel) => !place.has(panel.id))] };
}

/** Whether two arrangements put every panel in the same cells. */
export function samePlacements(a: Placement[], b: Placement[]): boolean {
  return (
    a.length === b.length &&
    a.every((place) => b.some((other) => other.id === place.id && other.x === place.x && other.row === place.row && other.span === place.span && other.height === place.height))
  );
}

/** Shows or hides a panel; a panel switched on that the layout lacks joins it next to its group. */
export function setVisible(layout: DashboardLayout, id: string, visible: boolean): DashboardLayout {
  if (!layout.panels.some((panel) => panel.id === id)) {
    const panel = defaultPanel(id);
    return panel ? { ...layout, panels: insertByGroup(layout.panels, { ...panel, visible }) } : layout;
  }
  return { ...layout, panels: layout.panels.map((panel) => (panel.id === id ? { ...panel, visible } : panel)) };
}

/** Sets a panel's width (wide-grid columns) and height (rows), within its limits. */
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
            rows: size.rows === undefined ? panel.rows : clamp(size.rows, definition.minRows, definition.maxRows),
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
