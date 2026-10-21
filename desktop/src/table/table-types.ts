/** The shapes the table speaks in. They keep the names Angular Material's table, sort and paginator used. */
export type SortDirection = "asc" | "desc" | "";

export interface Sort {
  active: string;
  direction: SortDirection;
}

export interface PageEvent {
  pageIndex: number;
  previousPageIndex?: number;
  pageSize: number;
  length: number;
}

/**
 * The rows an app-table shows. Callers replace the whole data source to change what is shown (the table indexes rows when
 * the source is replaced), the same way they did with MatTableDataSource.
 */
export class TableDataSource<T = any> {
  public data: T[];

  constructor(initialData: T[] = []) {
    this.data = initialData;
  }
}
