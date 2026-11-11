import { DEFAULT_RECEIPT_TABLE_COLUMNS } from "../interfaces/receipt-table-column-config.interface";
import { columnDisplayName, currentColumnKey, reconcileColumns } from "./receipt-table-columns";

function config(matColumnDef: string, visible: boolean, order: number) {
  return { matColumnDef, visible, order };
}

/** The built-in columns as persisted. */
function builtIns() {
  return DEFAULT_RECEIPT_TABLE_COLUMNS.map((column, index) =>
    config(column.matColumnDef, column.visible, index)
  );
}

describe("receipt-table-columns", () => {
  describe("columnDisplayName", () => {
    it("names a built-in column", () => {
      expect(columnDisplayName("resolved_date")).toBe("Settled on");
      expect(columnDisplayName("note")).toBe("Note");
    });

    it("falls back to the raw column def for an unknown column", () => {
      expect(columnDisplayName("custom_7")).toBe("custom_7");
    });
  });

  describe("currentColumnKey", () => {
    it("reads the key the Note column had while receipts had comments as the note", () => {
      expect(currentColumnKey("first_comment")).toBe("note");
    });

    it("leaves every other key alone, a property name of every object included", () => {
      expect(currentColumnKey("amount")).toBe("amount");
      expect(currentColumnKey("")).toBe("");
      expect(currentColumnKey("constructor")).toBe("constructor");
    });
  });

  describe("reconcileColumns", () => {
    it("drops a persisted column that is no longer a built-in one", () => {
      // A layout saved while custom field columns existed.
      const persisted = [...builtIns(), config("custom_7", true, 99)];

      const merged = reconcileColumns(persisted);

      expect(merged.some((column) => column.matColumnDef === "custom_7")).toBe(false);
    });

    it("preserves the persisted order and re-derives it contiguously", () => {
      const persisted = [...builtIns()].reverse().map((column, index) => ({ ...column, order: index * 3 }));

      const merged = reconcileColumns(persisted);

      expect(merged[0].matColumnDef).toBe(DEFAULT_RECEIPT_TABLE_COLUMNS[DEFAULT_RECEIPT_TABLE_COLUMNS.length - 1].matColumnDef);
      expect(merged.map((column) => column.order)).toEqual(merged.map((_, i) => i));
    });

    // A layout saved before the Note column existed gains it unchecked: it is
    // opt-in, so an upgrade must not widen anyone's table.
    it("appends the Note column hidden to a layout saved before it existed", () => {
      const persisted = builtIns()
        .filter((column) => column.matColumnDef !== "note")
        .map((column) => ({ ...column, visible: true }));

      const merged = reconcileColumns(persisted);

      const note = merged.find((column) => column.matColumnDef === "note");
      expect(note).toBeDefined();
      expect(note?.visible).toBe(false);
      expect(merged[merged.length - 1].matColumnDef).toBe("note");
    });

    // A browser that switched the Comment column on keeps it, in its place, as the Note column.
    it("keeps a layout's Comment column, with its place and visibility, as the Note column", () => {
      const persisted = [
        config("first_comment", true, 0),
        ...builtIns()
          .filter((column) => column.matColumnDef !== "note")
          .map((column, index) => ({ ...column, order: index + 1 })),
      ];

      const merged = reconcileColumns(persisted);

      expect(merged[0]).toEqual({ matColumnDef: "note", visible: true, order: 0 });
      expect(merged.filter((column) => column.matColumnDef === "note")).toHaveLength(1);
      expect(merged.some((column) => column.matColumnDef === "first_comment")).toBe(false);
      expect(merged).toHaveLength(DEFAULT_RECEIPT_TABLE_COLUMNS.length);
    });

    it("keeps the first of the two when a layout holds the old key and the new one", () => {
      const persisted = [
        config("first_comment", true, 0),
        ...builtIns().map((column, index) => ({ ...column, order: index + 1 })),
      ];

      const merged = reconcileColumns(persisted);

      expect(merged.filter((column) => column.matColumnDef === "note")).toEqual([{ matColumnDef: "note", visible: true, order: 0 }]);
      expect(merged).toHaveLength(DEFAULT_RECEIPT_TABLE_COLUMNS.length);
    });

    it("heals a missing built-in column", () => {
      const persisted = builtIns().filter((column) => column.matColumnDef !== "status");

      const merged = reconcileColumns(persisted);

      expect(merged.some((column) => column.matColumnDef === "status")).toBe(true);
    });

    it("drops a column that is not built in", () => {
      const persisted = [...builtIns(), config("bogus_column", true, 99)];

      const merged = reconcileColumns(persisted);

      expect(merged.some((column) => column.matColumnDef === "bogus_column")).toBe(false);
    });
  });
});
