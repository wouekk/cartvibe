import { TemplateRef } from '@angular/core';
import { SortDirection } from './table-types';

export interface TableColumn {
  columnHeader: string;
  matColumnDef: string;
  sortable: boolean;
  elementKey?: string;
  template?: TemplateRef<any>;
  defaultSortDirection?: SortDirection;
}
