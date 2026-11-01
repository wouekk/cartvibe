import { Component, signal, ChangeDetectionStrategy } from "@angular/core";
import { PageEvent, Sort, TableDataSource } from "../../table/table-types";
import { Subscription, take, tap } from "rxjs";
import { PagedTableInterface } from "../../interfaces/paged-table.interface";
import { BaseTableService } from "../../services/base-table.service";
import { TableColumn } from "../../table/table-column.interface";

@Component({
    selector: "app-base-table",
    templateUrl: "./base-table.component.html",
    styleUrl: "./base-table.component.scss",
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class BaseTableComponent<T> {
  public columns: TableColumn[] = [];

  public displayedColumns: string[] = [];

  public dataSource = signal(new TableDataSource<T>([]));

  public totalCount = signal(0);

  constructor(public baseTableService: BaseTableService) {}

  public setInitialSortedColumn(state: PagedTableInterface, columns: TableColumn[]): void {
    if (state.orderBy) {
      const column = columns.find((c) => c.matColumnDef === state.orderBy);
      if (column) {
        column.defaultSortDirection = state.sortDirection;
      }
    }
  }

  /** The page request in flight. A newer one cancels it, so a slow earlier answer cannot repaint a newer list. */
  protected tableDataRequest?: Subscription;

  public getTableData(): void {
    this.tableDataRequest?.unsubscribe();
    this.tableDataRequest = this.baseTableService
      .getPagedData()
      .pipe(
        take(1),
        tap((pagedData) => {
          this.dataSource.set(new TableDataSource(pagedData.data as T[]) as TableDataSource<T>);
          this.totalCount.set(pagedData.totalCount);
        })
      )
      .subscribe();
  }

  public sorted(sort: Sort): void {
    this.baseTableService.setOrderBy(sort);
    this.baseTableService.setSortDirection(sort.direction);

    this.getTableData();
  }

  public pageChanged(pageEvent: PageEvent): void {
    const newPage = pageEvent.pageIndex + 1;

    this.baseTableService.setPage(newPage);
    this.baseTableService.setPageSize(pageEvent.pageSize);

    this.getTableData();
  }
}
