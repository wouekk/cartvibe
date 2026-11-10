import { TemplateRef } from '@angular/core';
import { SortDirection } from './table-types';

/**
 * Where a column's cell goes on a phone, where each row is a card: the bold first line, a muted line under it,
 * the right-hand side (the first one bold: an amount), a labelled detail below, the row's actions, or nowhere.
 */
export type TablePhoneRole = "title" | "subtitle" | "aside" | "meta" | "actions" | "hidden";

export interface TableColumn {
  columnHeader: string;
  matColumnDef: string;
  sortable: boolean;
  elementKey?: string;
  template?: TemplateRef<any>;
  defaultSortDirection?: SortDirection;
  /** The cell's place on a phone's row card; see `TableComponent.cardLayout` for what an unset column gets. */
  phone?: TablePhoneRole;
}
