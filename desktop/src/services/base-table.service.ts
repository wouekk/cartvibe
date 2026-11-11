import { Injectable, Signal } from "@angular/core";
import { Observable } from "rxjs";
import { PagedData, PagedRequestCommand, SortDirection } from "../open-api";
import { PagedTable } from "../store/paged-table.store";
import { Sort } from "../table/table-types";

/** What a server-paged list needs: where its page and sort are kept, and how a page is fetched. */
@Injectable()
export abstract class BaseTableService {
  /** The store that keeps this list's page, page size and sort. */
  protected abstract readonly tableStore: PagedTable;

  abstract getPagedData(): Observable<PagedData>;

  public get page(): Signal<number> {
    return this.tableStore.page;
  }

  public get pageSize(): Signal<number> {
    return this.tableStore.pageSize;
  }

  public getPagedRequestCommand(): PagedRequestCommand {
    return this.tableStore.state();
  }

  public setPage(page: number): void {
    this.tableStore.setPage(page);
  }

  public setPageSize(pageSize: number): void {
    this.tableStore.setPageSize(pageSize);
  }

  public setOrderBy(orderBy: Sort): void {
    this.tableStore.setOrderBy(orderBy.active);
  }

  public setSortDirection(sortDirection: SortDirection): void {
    this.tableStore.setSortDirection(sortDirection);
  }
}
