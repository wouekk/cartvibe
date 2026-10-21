import { SortDirection } from "../table/table-types";

export interface PagedTableInterface {
  page: number;
  pageSize: number;
  orderBy: string;
  sortDirection: SortDirection;
}
