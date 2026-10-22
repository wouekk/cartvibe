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
  first_comment: "Comment",
};

export function columnDisplayName(matColumnDef: string): string {
  return RECEIPT_COLUMN_DISPLAY_NAMES[matColumnDef] ?? matColumnDef;
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
 * widens anyone's table.
 *
 * Order is otherwise preserved exactly as persisted.
 */
export function reconcileColumns(
  persisted: ReceiptTableColumnConfig[]
): ReceiptTableColumnConfig[] {
  const builtInColumnDefs = DEFAULT_RECEIPT_TABLE_COLUMNS.map(
    (column) => column.matColumnDef
  );

  const kept = [...persisted]
    .sort((a, b) => a.order - b.order)
    .filter((column) => builtInColumnDefs.includes(column.matColumnDef));

  const present = new Set(kept.map((column) => column.matColumnDef));

  const missingBuiltIns = DEFAULT_RECEIPT_TABLE_COLUMNS.filter(
    (column) => !present.has(column.matColumnDef)
  );

  return [...kept, ...missingBuiltIns].map((column, index) => ({
    matColumnDef: column.matColumnDef,
    visible: column.visible,
    order: index,
  }));
}
