export interface ReceiptTableColumnConfig {
  matColumnDef: string;
  visible: boolean;
  order: number;
}

export interface ReceiptTableColumns {
  columns: ReceiptTableColumnConfig[];
}

export const DEFAULT_RECEIPT_TABLE_COLUMNS: ReceiptTableColumnConfig[] = [
  { matColumnDef: 'created_at', visible: true, order: 0 },
  { matColumnDef: 'date', visible: true, order: 1 },
  { matColumnDef: 'name', visible: true, order: 2 },
  { matColumnDef: 'shop_name', visible: true, order: 3 },
  // No Paid By column (Phase 3 C4): a family does not split bills. Leaving it out of the defaults
  // also drops it from a layout saved before, through mergeCustomFieldColumns.
  { matColumnDef: 'amount', visible: true, order: 4 },
  { matColumnDef: 'categories', visible: true, order: 5 },
  { matColumnDef: 'tags', visible: true, order: 6 },
  { matColumnDef: 'status', visible: true, order: 7 },
  { matColumnDef: 'resolved_date', visible: true, order: 8 },
  // Opt-in: mergeCustomFieldColumns appends a missing built-in with the visibility
  // it has here, so an existing saved layout gains the column unchecked.
  { matColumnDef: 'first_comment', visible: false, order: 9 },
];