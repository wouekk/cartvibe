import {
  compactOrder,
  completeLayout,
  DashboardLayout,
  defaultLayout,
  movePanel,
  parseLayout,
  resizePanel,
  resolveLayout,
  serializeLayout,
  setVisible,
  sizeClassFor,
  spanFor,
  applyPlacements,
  compact,
  makeRoom,
  panelHeight,
  Placement,
  samePlacements,
  dropTargetAt,
  placePanels,
  sizeLimitHit,
  tagPanelId,
} from "./dashboard-layout";

const ALL = ["spent", "receipts", "unhealthy", "unplanned", "toBuy", "categories", "trend", "recentReceipts", "shoppingList"];
const ids = (panels: { id: string }[]) => panels.map((panel) => panel.id);

describe("dashboard layout", () => {
  it("picks the size class from the grid's own width", () => {
    expect(sizeClassFor(375)).toBe("compact");
    expect(sizeClassFor(639)).toBe("compact");
    expect(sizeClassFor(768)).toBe("regular");
    expect(sizeClassFor(1023)).toBe("regular");
    expect(sizeClassFor(1240)).toBe("wide");
  });

  it("starts with the KPI tiles, then tags, charts and lists; Spent and the charts fill whole rows", () => {
    const layout = defaultLayout([...ALL, tagPanelId(7)]);

    expect(ids(layout.panels)).toEqual(["spent", "receipts", "unhealthy", "unplanned", "toBuy", "tag:7", "categories", "trend", "recentReceipts", "shoppingList"]);
    const cols = Object.fromEntries(layout.panels.map((panel) => [panel.id, panel.cols]));
    expect(cols["spent"] + cols["receipts"] + cols["unhealthy"] + cols["unplanned"] + cols["toBuy"] + cols["tag:7"]).toBe(6);
    expect(cols["categories"] + cols["trend"]).toBe(6);
    expect(cols["recentReceipts"] + cols["shoppingList"]).toBe(6);
  });

  it("narrows Spent when tag tiles join, so a row of six tiles fits", () => {
    const panel = (layout: DashboardLayout, id: string) => layout.panels.find((candidate) => candidate.id === id)!;
    expect(panel(defaultLayout(ALL), "spent").cols).toBe(2);
    expect(panel(defaultLayout([...ALL, tagPanelId(1)]), "spent").cols).toBe(1);
  });

  it("fills every row of the starting layout, whatever panels are available", () => {
    const rowTotals = (available: string[]) => {
      const rows: number[] = [];
      let used = 0;
      for (const panel of defaultLayout(available).panels) {
        if (rows.length === 0 || used + panel.cols > 6) {
          rows.push(0);
          used = 0;
        }
        used += panel.cols;
        rows[rows.length - 1] = used;
      }
      return rows;
    };
    // No shopping list group: four tiles, two charts and the receipts list on its own.
    expect(rowTotals(["spent", "receipts", "unhealthy", "unplanned", "categories", "trend", "recentReceipts"])).toEqual([6, 6, 6]);
    expect(rowTotals(ALL)).toEqual([6, 6, 6]);
    expect(rowTotals([...ALL, tagPanelId(1)])).toEqual([6, 6, 6]);
  });

  it("lets a tile sit between larger panels", () => {
    const panels = resolveLayout(movePanel(defaultLayout(ALL), "wide", "trend", "receipts"), ALL, "wide");
    expect(ids(panels).slice(0, 3)).toEqual(["spent", "trend", "receipts"]);
  });

  describe("dropTargetAt", () => {
    const rects = [
      { id: "a", left: 0, top: 0, width: 100, height: 100 },
      { id: "b", left: 116, top: 0, width: 100, height: 100 },
      { id: "c", left: 0, top: 116, width: 216, height: 100 },
    ];

    it("picks the panel under the pointer, in any direction", () => {
      expect(dropTargetAt(rects, { x: 150, y: 50 }, "a")).toBe("b");
      expect(dropTargetAt(rects, { x: 50, y: 150 }, "a")).toBe("c");
      expect(dropTargetAt(rects, { x: 50, y: 50 }, "b")).toBe("a");
    });

    it("resolves empty space and the far corner to the nearest panel", () => {
      expect(dropTargetAt(rects, { x: 400, y: 20 }, "a")).toBe("b");
      expect(dropTargetAt(rects, { x: 400, y: 400 }, "a")).toBe("c");
    });

    it("never targets the dragged panel itself, and has no target when it is alone", () => {
      expect(dropTargetAt(rects, { x: 50, y: 50 }, "a")).not.toBe("a");
      expect(dropTargetAt([rects[0]], { x: 50, y: 50 }, "a")).toBeUndefined();
    });
  });

  describe("placePanels", () => {
    const item = (id: string, span: number, x?: number, y?: number, height?: number) => ({ id, span, x, y, height });

    it("flows unplaced panels row by row", () => {
      expect(placePanels([item("a", 4), item("b", 2), item("c", 3)], 6, true)).toEqual([
        { id: "a", x: 0, row: 0, span: 4, height: 1 },
        { id: "b", x: 4, row: 0, span: 2, height: 1 },
        { id: "c", x: 0, row: 1, span: 3, height: 1 },
      ]);
    });

    it("keeps a placed panel in its cell, leaving empty columns before it", () => {
      expect(placePanels([item("a", 2, 0, 0), item("b", 2, 4, 0)], 6, true).map((place) => place.x)).toEqual([0, 4]);
    });

    it("sends a panel whose cell is taken to the next free spot, and lets a panel saved far below float up", () => {
      const placed = placePanels([item("a", 3, 0, 0), item("b", 3, 1, 0), item("c", 2, 0, 5)], 6, true);
      expect(placed[1]).toMatchObject({ x: 3, row: 0 });
      expect(placed[2]).toMatchObject({ x: 0, row: 1 });
    });

    it("counts heights: the next panel goes beside a taller one, or below the shorter one", () => {
      const placed = placePanels([item("tall", 3, undefined, undefined, 4), item("b", 3, undefined, undefined, 2), item("c", 3, undefined, undefined, 2)], 6, true);
      expect(placed).toEqual([
        { id: "tall", x: 0, row: 0, span: 3, height: 4 },
        { id: "b", x: 3, row: 0, span: 3, height: 2 },
        { id: "c", x: 3, row: 2, span: 3, height: 2 },
      ]);
    });

    it("ignores saved cells and heights outside the wide grid", () => {
      const placed = placePanels([item("a", 1, 3, 0, 4), item("b", 1, 5, 0, 2)], 4, false);
      expect(placed.map((place) => place.x)).toEqual([0, 1]);
      expect(placed.map((place) => place.height)).toEqual([1, 1]);
    });
  });

  describe("compact", () => {
    const at = (id: string, x: number, row: number, span: number, height = 1): Placement => ({ id, x, row, span, height });
    const cells = (placements: Placement[]) => Object.fromEntries(placements.map((place) => [place.id, `${place.row}:${place.x}`]));

    it("lets every panel float up as far as it can, and no further than the panel above it", () => {
      expect(cells(compact([at("a", 0, 5, 3, 2), at("b", 3, 1, 3), at("c", 0, 9, 2)]))).toEqual({ a: "0:0", b: "0:3", c: "2:0" });
    });

    it("moves apart panels that were given the same cells", () => {
      expect(cells(compact([at("x", 0, 0, 3, 2), at("y", 0, 1, 3, 2)]))).toEqual({ x: "0:0", y: "2:0" });
    });
  });

  describe("making room for a moved panel", () => {
    const at = (id: string, x: number, row: number, span: number, height = 1): Placement => ({ id, x, row, span, height });
    const grid: Placement[] = [at("a", 0, 0, 2), at("b", 2, 0, 2), at("c", 0, 1, 4)];
    const tiles: Placement[] = [0, 1, 2, 3, 4, 5].map((x) => at(`t${x}`, x, 0, 1));
    const cells = (placements: Placement[]) => Object.fromEntries(placements.map((place) => [place.id, `${place.row}:${place.x}`]));

    it("takes a free cell and moves nothing else, the empty last column included", () => {
      expect(cells(makeRoom(grid, "a", 2, 0, 5))).toEqual({ a: "0:4", b: "0:2", c: "1:0" });
    });

    it("lets two neighbours change places, whichever of them is moved", () => {
      expect(cells(makeRoom(grid, "a", 2, 0, 2))).toEqual({ a: "0:2", b: "0:0", c: "1:0" });
      expect(cells(makeRoom(grid, "b", 2, 0, 0))).toEqual({ a: "0:2", b: "0:0", c: "1:0" });
    });

    it("lets a wide panel change places with a narrow neighbour once it covers the neighbour's middle", () => {
      const row: Placement[] = [at("tile", 0, 0, 2, 6), at("chart", 2, 0, 4, 6)];

      // One column to the left is not enough; two are.
      expect(cells(makeRoom(row, "chart", 4, 0, 1))).toEqual({ tile: "0:0", chart: "0:2" });
      expect(cells(makeRoom(row, "chart", 4, 0, 0))).toEqual({ tile: "0:4", chart: "0:0" });
      // And the tile over the chart: it has to pass the chart's middle.
      expect(cells(makeRoom(row, "tile", 2, 0, 2))).toEqual({ tile: "0:0", chart: "0:2" });
      expect(cells(makeRoom(row, "tile", 2, 0, 3))).toEqual({ tile: "0:4", chart: "0:0" });
    });

    it("slides a full row of tiles aside when one of them moves along it", () => {
      const moved = makeRoom(tiles, "t0", 1, 0, 3);

      expect([...moved].sort((a, b) => a.x - b.x).map((place) => place.id)).toEqual(["t1", "t2", "t3", "t0", "t4", "t5"]);
      expect(moved.every((place) => place.row === 0)).toBe(true);
    });

    it("moves the neighbours only as far as needed when the row has room", () => {
      const loose: Placement[] = [at("a", 0, 0, 1), at("b", 3, 0, 1), at("c", 0, 1, 2)];

      // c lands on b: b steps one column to the right, a does not move.
      expect(cells(makeRoom(loose, "c", 2, 0, 2))).toEqual({ a: "0:0", b: "0:4", c: "0:2" });
    });

    it("slides only within its own stretch of the row: a taller panel beside it is a wall", () => {
      const walled: Placement[] = [at("t0", 0, 0, 1, 2), at("t1", 1, 0, 1, 2), at("tall", 2, 0, 2, 6), at("t4", 4, 0, 1, 2)];
      const moved = makeRoom(walled, "t0", 1, 0, 1);

      expect(cells(moved)).toEqual({ t0: "0:1", t1: "0:0", tall: "0:2", t4: "0:4" });
    });

    it("swaps with the panels under it when they fit where it came from", () => {
      const charts: Placement[] = [at("A", 0, 0, 3), at("D", 3, 0, 3), at("B", 0, 1, 3), at("C", 3, 1, 3)];

      expect(cells(makeRoom(charts, "A", 3, 1, 0))).toEqual({ A: "1:0", D: "0:3", B: "0:0", C: "1:3" });
    });

    it("swaps a wide panel with the whole row of tiles it is dropped on", () => {
      const moved = makeRoom([...tiles, at("wide", 0, 1, 6)], "wide", 6, 0, 0);

      expect(moved.find((place) => place.id === "wide")).toMatchObject({ row: 0, x: 0 });
      expect(moved.filter((place) => place.id !== "wide").every((place) => place.row === 1)).toBe(true);
      expect(moved.filter((place) => place.id !== "wide").map((place) => place.x)).toEqual([0, 1, 2, 3, 4, 5]);
    });

    it("changes places top to bottom with a panel of another height, either way round", () => {
      const stack: Placement[] = [at("low", 0, 0, 3, 2), at("tall", 0, 2, 3, 4)];

      // The low panel is put under the tall one: the tall one goes up into the place it left.
      expect(cells(makeRoom(stack, "low", 3, 4, 0))).toEqual({ low: "4:0", tall: "0:0" });
      // The tall panel is put on the low one: the low one takes the end of the place the tall one left.
      expect(cells(makeRoom(stack, "tall", 3, 0, 0))).toEqual({ low: "4:0", tall: "0:0" });
    });

    it("pushes down what it lands on when there is nowhere else for it, and what that lands on in turn", () => {
      const full: Placement[] = [at("a", 0, 0, 2), at("b", 2, 0, 2), at("e", 4, 0, 2), at("c", 0, 1, 4), at("d", 4, 1, 2)];

      // d takes the cell; a and b go below it, and c below them.
      expect(cells(makeRoom(full, "d", 2, 0, 1))).toEqual({ d: "0:1", e: "0:4", a: "1:0", b: "1:2", c: "2:0" });
    });

    it("floats up: a panel put below the grid rests under the last one, and the place a panel left closes", () => {
      expect(cells(makeRoom(grid, "a", 2, 9, 0))).toEqual({ a: "2:0", b: "0:2", c: "1:0" });
      expect(cells(makeRoom(grid, "c", 2, 0, 4))).toEqual({ a: "0:0", b: "0:2", c: "0:4" });
      // A panel that had the top to itself, put below: the other one comes up and it rests under it.
      expect(cells(makeRoom([at("w", 0, 0, 6), at("c", 0, 1, 4)], "w", 6, 2, 0))).toEqual({ w: "1:0", c: "0:0" });
    });

    it("widens a panel where it stands: the next one steps aside, or goes below when the row is full", () => {
      expect(cells(makeRoom(grid, "a", 3, 0, 0, { fixed: true }))).toEqual({ a: "0:0", b: "0:3", c: "1:0" });
      expect(cells(makeRoom(grid, "a", 5, 0, 0, { fixed: true }))).toEqual({ a: "0:0", b: "1:2", c: "2:0" });
    });

    it("makes a panel taller where it stands and pushes down what is under it; shorter, and that floats up again", () => {
      const columns: Placement[] = [at("a", 0, 0, 3, 2), at("b", 0, 2, 3, 2), at("c", 3, 0, 3, 2)];
      const taller = makeRoom(columns, "a", 3, 0, 0, { fixed: true, height: 4 });

      expect(cells(taller)).toEqual({ a: "0:0", b: "4:0", c: "0:3" });
      expect(taller.find((place) => place.id === "a")?.height).toBe(4);
      expect(cells(makeRoom(taller, "a", 3, 0, 0, { fixed: true, height: 2 }))).toEqual(cells(columns));
    });

    it("puts a neighbour on the side the caller names, whatever their widths", () => {
      const row: Placement[] = [at("wide", 0, 0, 3), at("small", 3, 0, 1)];

      // Move right past the small one: it ends up on the left.
      expect(cells(makeRoom(row, "wide", 3, 0, 1, { centre: 3.51 }))).toEqual({ wide: "0:1", small: "0:0" });
    });

    it("leaves the arrangement alone when the panel is put back where it was", () => {
      expect(samePlacements(makeRoom(grid, "b", 2, 0, 2), grid)).toBe(true);
      expect(samePlacements(makeRoom(grid, "b", 2, 0, 0), grid)).toBe(false);
    });

    it("never leaves two panels in the same cells, wherever a panel is put", () => {
      const available = [...ALL, "warrantiesEndingSoon"];
      const start = resolveLayout(defaultLayout(available), available, "wide");
      const clash = (placements: Placement[]) =>
        placements.some((a) => placements.some((b) => a.id !== b.id && a.x < b.x + b.span && b.x < a.x + a.span && a.row < b.row + b.height && b.row < a.row + a.height));

      for (const panel of start) {
        for (let row = 0; row < 18; row++) {
          for (let x = 0; x <= 6 - panel.span; x++) {
            const moved = makeRoom(start, panel.id, panel.span, row, x);
            expect(clash(moved), `${panel.id} to ${row}:${x}`).toBe(false);
            expect(moved.every((place) => place.x >= 0 && place.x + place.span <= 6), `${panel.id} to ${row}:${x}`).toBe(true);
            // Nothing hangs in the air: every panel rests on the top edge or on another panel.
            expect(samePlacements(compact(moved), moved), `${panel.id} to ${row}:${x}`).toBe(true);
          }
        }
      }
    });

    it("saves an arrangement: every panel pinned to its cell, and the order following the grid", () => {
      const available = ["spent", "receipts", "categories"];
      const layout = defaultLayout(available);
      const placements = resolveLayout(layout, available, "wide");
      const moved = applyPlacements(layout, makeRoom(placements, "spent", placements[0].span, 0, 5));

      expect(moved.panels.every((panel) => panel.x !== undefined && panel.y !== undefined)).toBe(true);
      expect(resolveLayout(moved, available, "wide").map((panel) => panel.id)).toEqual(moved.panels.map((panel) => panel.id));
      const spent = moved.panels.find((panel) => panel.id === "spent")!;
      expect(spent.y).toBe(0);
      expect(spent.x).toBeGreaterThan(moved.panels.find((panel) => panel.id === "receipts")!.x as number);
    });
  });

  it("draws the starting layout in rows of the grid: tiles two rows tall, charts six, with nothing overlapping", () => {
    const panels = resolveLayout(undefined, [...ALL, "warrantiesEndingSoon"], "wide");
    const place = Object.fromEntries(panels.map((panel) => [panel.id, `${panel.row}:${panel.x} ${panel.span}x${panel.height}`]));

    expect(place).toEqual({
      spent: "0:0 2x2",
      receipts: "0:2 1x2",
      unhealthy: "0:3 1x2",
      unplanned: "0:4 1x2",
      toBuy: "0:5 1x2",
      categories: "2:0 3x6",
      trend: "2:3 3x6",
      recentReceipts: "8:0 4x5",
      shoppingList: "8:4 2x5",
      warrantiesEndingSoon: "13:0 6x3",
    });
    expect(panelHeight(2)).toBe("9.5rem");
  });

  it("starts a tile that shares a row with a chart as tall as the chart, and reads an older layout the same way", () => {
    const withTag = [...ALL, "warranties", tagPanelId(1)];
    const start = Object.fromEntries(resolveLayout(undefined, withTag, "wide").map((panel) => [panel.id, `${panel.row}:${panel.x} ${panel.span}x${panel.height}`]));
    expect(start["tag:1"]).toBe("2:0 2x6");
    expect(start["categories"]).toBe("2:2 4x6");

    // Saved before heights were free and never arranged in the PC view: the panels flow, and the tile stretched.
    const older = parseLayout(
      JSON.stringify({ version: 1, panels: defaultLayout(withTag).panels.map((panel) => ({ id: panel.id, visible: true, cols: panel.cols, rows: 1 })) })
    )!;
    expect(older.panels.find((panel) => panel.id === "tag:1")?.rows).toBe(6);
    expect(older.panels.find((panel) => panel.id === "spent")?.rows).toBe(2);
  });

  it("keeps a placed cell through parse and serialize, and drops a broken one", () => {
    const text = JSON.stringify({ version: 2, panels: [{ id: "spent", visible: true, cols: 1, rows: 2, x: 3, y: 1 }, { id: "receipts", visible: true, cols: 1, rows: 2, x: -2, y: "no" }] });
    const layout = parseLayout(text)!;
    expect(layout.panels[0]).toMatchObject({ x: 3, y: 1 });
    expect(layout.panels[1].x).toBeUndefined();
  });

  it("reads a layout saved before panels had free heights: height steps become rows, and rows of panels become cells", () => {
    const layout = parseLayout(
      JSON.stringify({
        version: 1,
        panels: [
          { id: "spent", visible: true, cols: 2, rows: 1, x: 0, y: 0 },
          { id: "categories", visible: true, cols: 3, rows: 2, x: 0, y: 1 },
          { id: "trend", visible: true, cols: 3, rows: 1, x: 3, y: 1 },
          { id: "recentReceipts", visible: true, cols: 4, rows: 1, x: 0, y: 2 },
          { id: "shoppingList", visible: false, cols: 2, rows: 1 },
        ],
      })
    )!;

    expect(layout.version).toBe(2);
    expect(layout.panels).toEqual([
      { id: "spent", visible: true, cols: 2, rows: 2, x: 0, y: 0 },
      // The taller step was 34rem: seven rows. Its row of panels is as tall as that.
      { id: "categories", visible: true, cols: 3, rows: 7, x: 0, y: 2 },
      // The panels of a row stretched to its tallest one, so the chart beside it is as tall.
      { id: "trend", visible: true, cols: 3, rows: 7, x: 3, y: 2 },
      { id: "recentReceipts", visible: true, cols: 4, rows: 5, x: 0, y: 9 },
      { id: "shoppingList", visible: false, cols: 2, rows: 5 },
    ]);
    // Drawn where it was: the same panels side by side, in the same order from the top.
    const drawn = resolveLayout(layout, ALL, "wide");
    const rowOf = (id: string) => drawn.find((panel) => panel.id === id)!.row;
    expect(rowOf("categories")).toBe(rowOf("trend"));
    expect(rowOf("spent")).toBeLessThan(rowOf("categories"));
    expect(rowOf("categories")).toBeLessThan(rowOf("recentReceipts"));
  });

  describe("sizeLimitHit", () => {
    it("reports which limit a size runs into", () => {
      expect(sizeLimitHit("spent", { cols: 0 })).toEqual({ limit: "min-cols", value: 1 });
      expect(sizeLimitHit("spent", { cols: 3 })).toEqual({ limit: "max-cols", value: 2 });
      expect(sizeLimitHit("spent", { rows: 7 })).toEqual({ limit: "max-rows", value: 6 });
      expect(sizeLimitHit("spent", { rows: 1 })).toEqual({ limit: "min-rows", value: 2 });
      expect(sizeLimitHit("categories", { rows: 5 })).toEqual({ limit: "min-rows", value: 6 });
      expect(sizeLimitHit("categories", { cols: 4, rows: 9 })).toBeUndefined();
    });
  });

  it("puts the shopping list first on a phone until the user arranges the phone", () => {
    const layout = defaultLayout(ALL);
    expect(ids(resolveLayout(layout, ALL, "compact"))[0]).toBe("shoppingList");
    expect(ids(resolveLayout(layout, ALL, "wide"))[0]).toBe("spent");

    const arranged = movePanel(layout, "compact", "spent", "shoppingList");
    expect(ids(resolveLayout(arranged, ALL, "compact")).slice(0, 2)).toEqual(["spent", "shoppingList"]);
    // The tablet and PC order is untouched by arranging the phone.
    expect(ids(arranged.panels)).toEqual(ids(layout.panels));
  });

  it("moves a panel in the shared order without touching the phone's own order", () => {
    const layout = movePanel(defaultLayout(ALL), "compact", "trend", "shoppingList");
    const moved = movePanel(layout, "wide", "recentReceipts", "spent");

    expect(ids(moved.panels)[0]).toBe("recentReceipts");
    expect(moved.compactOrder).toEqual(layout.compactOrder);
  });

  it("hides and shows panels; a hidden panel is not drawn but keeps its place", () => {
    const hidden = setVisible(defaultLayout(ALL), "unhealthy", false);
    expect(ids(resolveLayout(hidden, ALL, "wide"))).not.toContain("unhealthy");

    const shown = setVisible(hidden, "unhealthy", true);
    expect(ids(resolveLayout(shown, ALL, "wide"))[2]).toBe("unhealthy");
  });

  it("keeps sizes within each panel's limits and clamps them per screen size", () => {
    let layout = defaultLayout(ALL);
    layout = resizePanel(layout, "receipts", { cols: 5, rows: 9 });
    layout = resizePanel(layout, "trend", { cols: 1, rows: 40 });
    layout = resizePanel(layout, "shoppingList", { cols: 6 });

    const panel = (id: string) => layout.panels.find((candidate) => candidate.id === id)!;
    expect(panel("receipts")).toMatchObject({ cols: 2, rows: 6 });
    expect(panel("trend")).toMatchObject({ cols: 3, rows: 12 });
    expect(resizePanel(layout, "trend", { rows: 1 }).panels.find((candidate) => candidate.id === "trend")?.rows).toBe(6);
    expect(panel("shoppingList").cols).toBe(3);

    // On a tablet the charts take the whole row, a KPI tile keeps its width; on a phone everything is one column.
    expect(spanFor(panel("trend"), "regular")).toBe(4);
    expect(spanFor(panel("receipts"), "regular")).toBe(2);
    expect(spanFor(panel("trend"), "compact")).toBe(1);
  });

  it("adds a tag an admin just put on the Dashboard, next to the other tiles, and drops one that is gone", () => {
    const saved = defaultLayout(ALL);
    const withTag = resolveLayout(saved, [...ALL, tagPanelId(3)], "wide");
    expect(ids(withTag).indexOf("tag:3")).toBe(5);

    const withTagSaved = completeLayout(saved, [...ALL, tagPanelId(3)]);
    expect(ids(resolveLayout(withTagSaved, ALL, "wide"))).not.toContain("tag:3");
    // Still in the document, so it comes back with its settings if the tag returns.
    expect(ids(withTagSaved.panels)).toContain("tag:3");
  });

  it("leaves out panels the person cannot use (no shopping lists)", () => {
    const available = ALL.filter((id) => id !== "toBuy" && id !== "shoppingList");
    expect(ids(resolveLayout(undefined, available, "compact"))).toEqual(available);
  });

  it("reads back what it saves, keeps unknown panels and refuses anything else", () => {
    const layout: DashboardLayout = { ...movePanel(defaultLayout(ALL), "compact", "trend", "shoppingList") };
    layout.panels = [...layout.panels, { id: "future-panel", visible: true, cols: 9, rows: 4 }];

    const parsed = parseLayout(serializeLayout(layout));
    expect(parsed).toEqual(layout);
    expect(ids(resolveLayout(parsed, ALL, "wide"))).not.toContain("future-panel");

    expect(parseLayout("")).toBeUndefined();
    expect(parseLayout("{nope")).toBeUndefined();
    expect(parseLayout('{"version":3,"panels":[]}')).toBeUndefined();
    expect(parseLayout('{"version":1}')).toBeUndefined();
  });

  it("repairs a hand-edited document: duplicates, sizes out of range, missing fields", () => {
    const parsed = parseLayout(
      '{"version":1,"panels":[{"id":"spent","cols":40},{"id":"spent","cols":1},{"id":"trend","rows":0,"visible":false},{"cols":2}],"compactOrder":["trend","trend",3]}'
    );
    expect(parsed?.panels).toEqual([
      { id: "spent", visible: true, cols: 2, rows: 2 },
      { id: "trend", visible: false, cols: 3, rows: 6 },
    ]);
    // The same document as today's version: a height out of range comes back to the nearest the panel allows.
    expect(parseLayout('{"version":2,"panels":[{"id":"trend","cols":3,"rows":99},{"id":"spent","cols":1,"rows":0}]}')?.panels).toEqual([
      { id: "trend", visible: true, cols: 3, rows: 12 },
      { id: "spent", visible: true, cols: 1, rows: 2 },
    ]);
    expect(parsed?.compactOrder).toEqual(["trend"]);
    expect(compactOrder(parsed!)).toEqual(["trend", "spent"]);
  });
});
