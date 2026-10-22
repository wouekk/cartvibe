import { DEFAULT_RECEIPT_TABLE_COLUMNS } from "../interfaces/receipt-table-column-config.interface";
import { columnDisplayName, reconcileColumns } from "./receipt-table-columns";

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
      expect(columnDisplayName("resolved_date")).toBe("Done on");
      expect(columnDisplayName("first_comment")).toBe("Comment");
    });

    it("falls back to the raw column def for an unknown column", () => {
      expect(columnDisplayName("custom_7")).toBe("custom_7");
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

    // A layout saved before the Comment column existed gains it unchecked: it is
    // opt-in, so an upgrade must not widen anyone's table.
    it("appends the Comment column hidden to a layout saved before it existed", () => {
      const persisted = builtIns()
        .filter((column) => column.matColumnDef !== "first_comment")
        .map((column) => ({ ...column, visible: true }));

      const merged = reconcileColumns(persisted);

      const comment = merged.find((column) => column.matColumnDef === "first_comment");
      expect(comment).toBeDefined();
      expect(comment?.visible).toBe(false);
      expect(merged[merged.length - 1].matColumnDef).toBe("first_comment");
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
