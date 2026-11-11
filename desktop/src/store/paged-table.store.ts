import { computed, Signal } from "@angular/core";
import { PagedTableInterface } from "../interfaces/paged-table.interface";
import { PagedRequestCommand } from "../open-api";
import { SortDirection } from "../table/table-types";
import { StateStore } from "./state-store";

/** What a list's table service needs of the store behind it (`BaseTableService`). */
export interface PagedTable {
  readonly state: Signal<PagedRequestCommand>;
  readonly page: Signal<number>;
  readonly pageSize: Signal<number>;
  setPage(page: number): void;
  setPageSize(pageSize: number): void;
  setOrderBy(orderBy: string): void;
  setSortDirection(sortDirection: SortDirection): void;
}

/** What every server-paged list keeps: its page, page size and sort. `state` is the request the list sends. */
export abstract class PagedTableStore<T extends PagedRequestCommand = PagedTableInterface> extends StateStore<T> implements PagedTable {
  public readonly page = computed(() => this.state().page);

  public readonly pageSize = computed(() => this.state().pageSize);

  public setPage(page: number): void {
    this.patch({ page } as Partial<T>);
  }

  public setPageSize(pageSize: number): void {
    this.patch({ pageSize } as Partial<T>);
  }

  public setOrderBy(orderBy: string): void {
    this.patch({ orderBy } as Partial<T>);
  }

  public setSortDirection(sortDirection: SortDirection): void {
    this.patch({ sortDirection } as Partial<T>);
  }
}
