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
  dropTargetAt,
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
