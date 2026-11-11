import {
  DEFAULT_RECEIPT_TABLE_COLUMNS,
  ReceiptTableColumnConfig,
} from "../interfaces/receipt-table-column-config.interface";

/** The header shown for each built-in column, in the table and in the dialog. */
export const RECEIPT_COLUMN_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  created_at: "Added At",
  date: "Receipt Date",
  name: "Name",
  shop_name: "Shop",
  paid_by_user_id: "Added by",
  amount: "Amount",
  categories: "Categories",
  tags: "Tags",
  status: "Status",
  // "Settled on", in a family's words (Phase 3 C6/W1).
  resolved_date: "Settled on",
  note: "Note",
};

/**
 * Columns that changed their key. A browser keeps its layout and its sort, so a key from before the change is
 * read as the new one. `first_comment` was the Note column while a receipt had a thread of comments.
 */
const RENAMED_RECEIPT_COLUMNS: Readonly<Record<string, string>> = {
  first_comment: "note",
};

/** A column key as it is called today. */
export function currentColumnKey(key: string): string {
  return Object.hasOwn(RENAMED_RECEIPT_COLUMNS, key) ? RENAMED_RECEIPT_COLUMNS[key] : key;
}

/**
 * The key a stored layout named its columns under until 2026-11 (a name left from Angular Material). A browser
 * keeps its layout across updates, so reconcileColumns still reads it; nothing writes it any more.
 */
const LEGACY_COLUMN_NAME_KEY = "matColumnDef";

/** The name of a stored column, whichever key it was stored under. */
function storedColumnName(column: ReceiptTableColumnConfig): string {
  if (typeof column.columnDef === "string") {
    return column.columnDef;
  }
  const legacy = (column as unknown as Record<string, unknown>)[LEGACY_COLUMN_NAME_KEY];
  return typeof legacy === "string" ? legacy : "";
}

export function columnDisplayName(columnDef: string): string {
  return RECEIPT_COLUMN_DISPLAY_NAMES[columnDef] ?? columnDef;
}

/**
 * Reconciles a persisted column configuration with the columns that exist right
 * now.
 *
 * The configuration lives in localStorage, so it outlives the columns it was
 * written against. Anything that is no longer a built-in column is dropped
 * (leaving it in place would make the table ask the API to sort on a column that
 * no longer exists), and a built-in column the saved layout lacks is appended
 * with the visibility it has in the defaults, so an upgrade never silently
 * widens anyone's table. A column that was renamed keeps its place and its
 * visibility under its new key, and so does a layout stored under the older
 * name of the key itself.
 *
 * Order is otherwise preserved exactly as persisted.
 */
export function reconcileColumns(
  persisted: ReceiptTableColumnConfig[]
): ReceiptTableColumnConfig[] {
  const builtInColumnDefs = DEFAULT_RECEIPT_TABLE_COLUMNS.map(
    (column) => column.columnDef
  );

  const present = new Set<string>();
  const kept: ReceiptTableColumnConfig[] = [];
  for (const column of [...persisted].sort((a, b) => a.order - b.order)) {
    const key = currentColumnKey(storedColumnName(column));
    // A layout that somehow holds both the old key and the new one keeps the first.
    if (builtInColumnDefs.includes(key) && !present.has(key)) {
      present.add(key);
      kept.push({ columnDef: key, visible: column.visible, order: column.order });
    }
  }

  const missingBuiltIns = DEFAULT_RECEIPT_TABLE_COLUMNS.filter(
    (column) => !present.has(column.columnDef)
  );

  return [...kept, ...missingBuiltIns].map((column, index) => ({
    columnDef: column.columnDef,
    visible: column.visible,
    order: index,
  }));
}
