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
  makeRoom,
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
    const item = (id: string, span: number, x?: number, y?: number) => ({ id, span, x, y });

    it("flows unplaced panels row by row", () => {
      expect(placePanels([item("a", 4), item("b", 2), item("c", 3)], 6, true)).toEqual([
        { id: "a", x: 0, row: 0, span: 4 },
        { id: "b", x: 4, row: 0, span: 2 },
        { id: "c", x: 0, row: 1, span: 3 },
      ]);
    });

    it("keeps a placed panel in its cell, leaving empty columns before it", () => {
      expect(placePanels([item("a", 2, 0, 0), item("b", 2, 4, 0)], 6, true).map((place) => place.x)).toEqual([0, 4]);
    });

    it("sends a panel whose cell is taken to the next free spot, and numbers the rows without gaps", () => {
      const placed = placePanels([item("a", 3, 0, 0), item("b", 3, 1, 0), item("c", 2, 0, 5)], 6, true);
      expect(placed[1]).toMatchObject({ x: 3, row: 0 });
      expect(placed[2]).toMatchObject({ x: 0, row: 1 });
    });

    it("ignores saved cells outside the wide grid", () => {
      expect(placePanels([item("a", 1, 3, 0), item("b", 1, 5, 0)], 4, false).map((place) => place.x)).toEqual([0, 1]);
    });
  });

  describe("making room for a moved panel", () => {
    const grid: Placement[] = [
      { id: "a", x: 0, row: 0, span: 2 },
      { id: "b", x: 2, row: 0, span: 2 },
      { id: "c", x: 0, row: 1, span: 4 },
    ];
    const tiles: Placement[] = [0, 1, 2, 3, 4, 5].map((x) => ({ id: `t${x}`, x, row: 0, span: 1 }));
    const cells = (placements: Placement[]) => Object.fromEntries(placements.map((place) => [place.id, `${place.row}:${place.x}`]));

    it("takes a free cell and moves nothing else, the empty last column included", () => {
      const room = makeRoom(grid, "a", 2, 0, 5);

      expect(cells(room.placements)).toEqual({ a: "0:4", b: "0:2", c: "1:0" });
      expect(room.displaced).toEqual([]);
    });

    it("lets two neighbours change places, whichever of them is moved", () => {
      expect(cells(makeRoom(grid, "a", 2, 0, 2).placements)).toEqual({ a: "0:2", b: "0:0", c: "1:0" });
      expect(cells(makeRoom(grid, "b", 2, 0, 0).placements)).toEqual({ a: "0:2", b: "0:0", c: "1:0" });
    });

    it("slides a full row of tiles aside when one of them moves along it", () => {
      const moved = makeRoom(tiles, "t0", 1, 0, 3).placements;

      expect([...moved].sort((a, b) => a.x - b.x).map((place) => place.id)).toEqual(["t1", "t2", "t3", "t0", "t4", "t5"]);
      expect(moved.every((place) => place.row === 0)).toBe(true);
    });

    it("moves the neighbours only as far as needed when the row has room", () => {
      const loose: Placement[] = [
        { id: "a", x: 0, row: 0, span: 1 },
        { id: "b", x: 3, row: 0, span: 1 },
        { id: "c", x: 0, row: 1, span: 2 },
      ];

      // c lands on b: b steps one column to the right, a does not move.
      expect(cells(makeRoom(loose, "c", 2, 0, 2).placements)).toEqual({ a: "0:0", b: "0:4", c: "0:2" });
    });

    it("swaps with the panels under it when they fit where it came from", () => {
      const charts: Placement[] = [
        { id: "A", x: 0, row: 0, span: 3 },
        { id: "D", x: 3, row: 0, span: 3 },
        { id: "B", x: 0, row: 1, span: 3 },
        { id: "C", x: 3, row: 1, span: 3 },
      ];
      const room = makeRoom(charts, "A", 3, 1, 0);

      expect(cells(room.placements)).toEqual({ A: "1:0", D: "0:3", B: "0:0", C: "1:3" });
      expect(room.displaced).toEqual(["B"]);
    });

    it("swaps a wide panel with the whole row of tiles it is dropped on", () => {
      const withChart: Placement[] = [...tiles, { id: "wide", x: 0, row: 1, span: 6 }];
      const moved = makeRoom(withChart, "wide", 6, 0, 0).placements;

      expect(moved.find((place) => place.id === "wide")).toMatchObject({ row: 0, x: 0 });
      expect(moved.filter((place) => place.id !== "wide").every((place) => place.row === 1)).toBe(true);
      expect(moved.filter((place) => place.id !== "wide").map((place) => place.x)).toEqual([0, 1, 2, 3, 4, 5]);
    });

    it("drops what no longer fits into a new row right below, in order, when a swap has no room", () => {
      const full: Placement[] = [
        { id: "a", x: 0, row: 0, span: 2 },
        { id: "b", x: 2, row: 0, span: 2 },
        { id: "e", x: 4, row: 0, span: 2 },
        { id: "c", x: 0, row: 1, span: 4 },
        { id: "d", x: 4, row: 1, span: 2 },
      ];
      const room = makeRoom(full, "d", 2, 0, 1);

      // d takes the cell; b slides right beside it; a and e drop into a row of their own; c's row moves down.
      expect(cells(room.placements)).toEqual({ d: "0:1", b: "0:3", a: "1:0", e: "1:2", c: "2:0" });
      expect(room.displaced).toEqual(["a", "e"]);
    });

    it("opens a new last row below the grid, and numbers the rows without gaps", () => {
      expect(cells(makeRoom(grid, "a", 2, 9, 0).placements)).toEqual({ a: "2:0", b: "0:2", c: "1:0" });
      // c was alone in its row: the row it left closes.
      expect(cells(makeRoom(grid, "c", 2, 0, 4).placements)).toEqual({ a: "0:0", b: "0:2", c: "0:4" });
    });

    it("keeps the row a dragged panel came from while it is dragged, so nothing jumps under the pointer", () => {
      const lone: Placement[] = [
        { id: "w", x: 0, row: 0, span: 6 },
        { id: "c", x: 0, row: 1, span: 4 },
      ];

      const dragging = makeRoom(lone, "w", 6, 2, 0, { keepOriginRow: true });
      expect(cells(dragging.placements)).toEqual({ w: "2:0", c: "1:0" });
      expect(dragging.originRow).toBe(0);

      const dropped = makeRoom(lone, "w", 6, 2, 0);
      expect(cells(dropped.placements)).toEqual({ w: "1:0", c: "0:0" });
      expect(dropped.originRow).toBeUndefined();
    });

    it("widens a panel where it stands: the next one steps aside, or drops below when the row is full", () => {
      expect(cells(makeRoom(grid, "a", 3, 0, 0, { fixed: true }).placements)).toEqual({ a: "0:0", b: "0:3", c: "1:0" });

      const tooWide = makeRoom(grid, "a", 5, 0, 0, { fixed: true });
      expect(cells(tooWide.placements)).toEqual({ a: "0:0", b: "1:0", c: "2:0" });
      expect(tooWide.displaced).toEqual(["b"]);
    });

    it("puts a neighbour on the side the caller names, whatever their widths", () => {
      const row: Placement[] = [
        { id: "wide", x: 0, row: 0, span: 3 },
        { id: "small", x: 3, row: 0, span: 1 },
      ];

      // Move right past the small one: it ends up on the left.
      expect(cells(makeRoom(row, "wide", 3, 0, 1, { centre: 3.51 }).placements)).toEqual({ wide: "0:1", small: "0:0" });
    });

    it("leaves the arrangement alone when the panel is put back where it was", () => {
      expect(samePlacements(makeRoom(grid, "b", 2, 0, 2).placements, grid)).toBe(true);
      expect(samePlacements(makeRoom(grid, "b", 2, 0, 0).placements, grid)).toBe(false);
    });

    it("saves an arrangement: every panel pinned to its cell, and the order following the grid", () => {
      const available = ["spent", "receipts", "categories"];
      const layout = defaultLayout(available);
      const placements = resolveLayout(layout, available, "wide");
      const moved = applyPlacements(layout, makeRoom(placements, "spent", placements[0].span, 0, 5).placements);

      expect(moved.panels.every((panel) => panel.x !== undefined && panel.y !== undefined)).toBe(true);
      expect(resolveLayout(moved, available, "wide").map((panel) => panel.id)).toEqual(moved.panels.map((panel) => panel.id));
      const spent = moved.panels.find((panel) => panel.id === "spent")!;
      expect(spent.y).toBe(0);
      expect(spent.x).toBeGreaterThan(moved.panels.find((panel) => panel.id === "receipts")!.x as number);
    });
  });

  it("keeps a placed cell through parse and serialize, and drops a broken one", () => {
    const text = JSON.stringify({ version: 1, panels: [{ id: "spent", visible: true, cols: 1, rows: 1, x: 3, y: 1 }, { id: "receipts", visible: true, cols: 1, rows: 1, x: -2, y: "no" }] });
    const layout = parseLayout(text)!;
    expect(layout.panels[0]).toMatchObject({ x: 3, y: 1 });
    expect(layout.panels[1].x).toBeUndefined();
  });

  describe("sizeLimitHit", () => {
    it("reports which limit a size runs into", () => {
      expect(sizeLimitHit("spent", { cols: 0 })).toEqual({ limit: "min-cols", value: 1 });
      expect(sizeLimitHit("spent", { cols: 3 })).toEqual({ limit: "max-cols", value: 2 });
      expect(sizeLimitHit("spent", { rows: 2 })).toEqual({ limit: "max-rows", value: 1 });
      expect(sizeLimitHit("categories", { rows: 0 })).toEqual({ limit: "min-rows", value: 1 });
      expect(sizeLimitHit("categories", { cols: 4, rows: 2 })).toBeUndefined();
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
    layout = resizePanel(layout, "receipts", { cols: 5, rows: 2 });
    layout = resizePanel(layout, "trend", { cols: 1, rows: 9 });
    layout = resizePanel(layout, "shoppingList", { cols: 6 });

    const panel = (id: string) => layout.panels.find((candidate) => candidate.id === id)!;
    expect(panel("receipts")).toMatchObject({ cols: 2, rows: 1 });
    expect(panel("trend")).toMatchObject({ cols: 3, rows: 2 });
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
    expect(parseLayout('{"version":2,"panels":[]}')).toBeUndefined();
    expect(parseLayout('{"version":1}')).toBeUndefined();
  });

  it("repairs a hand-edited document: duplicates, sizes out of range, missing fields", () => {
    const parsed = parseLayout(
      '{"version":1,"panels":[{"id":"spent","cols":40},{"id":"spent","cols":1},{"id":"trend","rows":0,"visible":false},{"cols":2}],"compactOrder":["trend","trend",3]}'
    );
    expect(parsed?.panels).toEqual([
      { id: "spent", visible: true, cols: 2, rows: 1 },
      { id: "trend", visible: false, cols: 3, rows: 1 },
    ]);
    expect(parsed?.compactOrder).toEqual(["trend"]);
    expect(compactOrder(parsed!)).toEqual(["trend", "spent"]);
  });
});
