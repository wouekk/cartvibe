export interface ReceiptTableColumnConfig {
  columnDef: string;
  visible: boolean;
  order: number;
}

export interface ReceiptTableColumns {
  columns: ReceiptTableColumnConfig[];
}

export const DEFAULT_RECEIPT_TABLE_COLUMNS: ReceiptTableColumnConfig[] = [
  // The day on the receipt comes first and is what the table sorts by: when the receipt was added says
  // little to a family (Phase 3 feedback). There is no separate Name column either: the clickable Shop
  // shows the shop, or the receipt's name when no shop was read.
  { columnDef: 'date', visible: true, order: 0 },
  { columnDef: 'shop_name', visible: true, order: 1 },
  { columnDef: 'amount', visible: true, order: 2 },
  { columnDef: 'status', visible: true, order: 3 },
  // "Added by": the person who added the receipt, which is who a family means by paid by.
  { columnDef: 'paid_by_user_id', visible: true, order: 4 },
  // No Added At, Name, Categories, Tags or Done on columns: categories and tags live on the products,
  // and Done on only repeated Added At. Leaving them out of the defaults also drops them from a layout
  // saved before, through reconcileColumns.
  // Opt-in: reconcileColumns appends a missing built-in with the visibility
  // it has here, so an existing saved layout gains the column unchecked.
  { columnDef: 'note', visible: false, order: 5 },
];
