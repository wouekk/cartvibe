import { LiveAnnouncer } from "@angular/cdk/a11y";
import { SelectionModel } from "@angular/cdk/collections";
import { Component, Input, OnChanges, SimpleChanges, inject, input, output, signal, ChangeDetectionStrategy } from "@angular/core";
import { TranslationService } from "../../i18n/translation.service";
import { TableColumn } from "../table-column.interface";
import { PageEvent, Sort, TableDataSource } from "../table-types";
import { marker } from "../../i18n/marker";

@Component({
  selector: "app-table",
  host: { class: "block overflow-hidden rounded-xl border border-border bg-card shadow-md" },
  templateUrl: "./table.component.html",
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class TableComponent implements OnChanges {
  public readonly columns = input<TableColumn[]>([]);
  public readonly displayedColumns = input<string[]>([]);
  public readonly dataSource = input(new TableDataSource<any>([]));
  public readonly pagination = input<boolean>(false);
  public readonly selectionCheckboxes = input<boolean>(false);
  public readonly page = input<number>(0);
  public readonly pageSize = input<number>(50);
  @Input() public length: number = 0;
  public readonly expandedRowTemplate = input<any>();
  public readonly rowExpandable = input<(row: any) => boolean>(() => true);
  /**
   * Shown in place of the rows (and the pager) when there are none. Callers pass it once their data has
   * loaded, so the empty state never flashes before the first answer. Content marked [tableEmptyAction]
   * is projected under it (an "Add" button).
   */
  public readonly emptyText = input<string>("");
  public readonly emptyIcon = input<string>("list");

  public readonly sorted = output<Sort>();
  public readonly pageChange = output<PageEvent>();

  public defaultSort?: Sort;

  /** The column the rows are sorted by and which way (the caller does the sorting; the table reports it). */
  public readonly sortState = signal<Sort>({ active: "", direction: "" });

  public readonly pageSizeOptions = [5, 15, 25, 50, 100];

  public selection = new SelectionModel<any>(true, []);

  public expandedElement: any;

  public rowIndexes: { [key: number]: number } = {};
  private rowIndexesByReference = new Map<any, number>();

  private readonly translation = inject(TranslationService);

  constructor(private _liveAnnouncer: LiveAnnouncer) {}

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes["columns"]) {
      const column = this.columns().find((c) => c.defaultSortDirection);
      if (column) {
        this.defaultSort = {
          active: column.matColumnDef,
          direction: column.defaultSortDirection ?? "desc",
        };
        this.sortState.set({ ...this.defaultSort });
        this.sorted.emit({ ...this.defaultSort });
      } else {
        this.defaultSort = {
          active: "",
          direction: "",
        };
      }
    }

    if (changes["dataSource"]) {
      this.setRowIndexes();
    }
  }

  /**
   * The index a cell template should act on: the row's position in the ORIGINAL
   * data, so an action still targets the right record after the table is sorted.
   *
   * Rows WITHOUT an id (e.g. GroupMember, whose key is composite userId+groupId)
   * fall back to the rendered index. They used to all collapse onto a single
   * `undefined` key in rowIndexes, so every such row reported the LAST row's
   * index — meaning edit/delete in an actions column hit the wrong record.
   */
  public indexFor(element: any): number {
    if (element?.id !== undefined && element?.id !== null) {
      const mapped = this.rowIndexes[element.id];
      if (mapped !== undefined) {
        return mapped;
      }
    }
    // Reference lookup — the table renders these exact objects, so this resolves
    // an id-less row to its real position. Precomputed rather than an indexOf
    // scan, because the template calls this for every rendered cell.
    return this.rowIndexesByReference.get(element) ?? -1;
  }

  // Two maps because the rows have two possible identities: by id where there is
  // one, by object reference for composite-key rows (e.g. GroupMember).
  //
  // Both rely on callers REPLACING the dataSource rather than mutating its `data`
  // in place — which every consumer does (`dataSource.set(new MatTableDataSource(...))`),
  // and which is what makes ngOnChanges fire. An in-place mutation would leave both
  // maps stale and indexFor pointing at the wrong record.
  private setRowIndexes(): void {
    const indexes: { [key: number]: number } = {};
    const byReference = new Map<any, number>();
    this.dataSource().data.forEach((row, index) => {
      if (row.id !== undefined && row.id !== null) {
        indexes[row.id] = index;
      }
      byReference.set(row, index);
    });

    this.rowIndexes = indexes;
    this.rowIndexesByReference = byReference;
  }

  public isAllSelected() {
    const numSelected = this.selection.selected.length;
    const numRows = this.dataSource().data.length;
    return numSelected === numRows;
  }

  public toggleAllRows() {
    if (this.isAllSelected()) {
      this.selection.clear();
      return;
    }

    this.selection.select(...this.dataSource().data);
  }

  /** The column definition behind a displayed column id. */
  public columnFor(id: string): TableColumn | undefined {
    return this.columns().find((column) => column.matColumnDef === id);
  }

  public ariaSort(column: TableColumn): string | null {
    const state = this.sortState();
    if (!column.sortable || state.active !== column.matColumnDef || !state.direction) {
      return column.sortable ? "none" : null;
    }

    return state.direction === "asc" ? "ascending" : "descending";
  }

  /** A header was clicked: ascending, then descending, then (unless it is the default sort) unsorted. */
  public toggleSort(column: TableColumn): void {
    if (!column.sortable) {
      return;
    }

    const state = this.sortState();
    const keepSorted = !!column.defaultSortDirection;
    let direction: Sort["direction"] = "asc";
    if (state.active === column.matColumnDef) {
      direction = state.direction === "asc" ? "desc" : state.direction === "desc" && !keepSorted ? "" : "asc";
    }

    this.announceSortChange({ active: direction ? column.matColumnDef : "", direction });
  }

  /** Announce the change in sort state for assistive technology, and tell the owner. */
  public announceSortChange(sortState: Sort) {
    this.sortState.set(sortState);
    if (sortState.direction) {
      this._liveAnnouncer.announce(this.translation.t(sortState.direction === "asc" ? marker("Sorted ascending") : marker("Sorted descending")));
    } else {
      this._liveAnnouncer.announce(this.translation.t(marker("Sorting cleared")));
    }

    this.sorted.emit(sortState);
  }

  public isEmpty(): boolean {
    return !!this.emptyText() && this.dataSource().data.length === 0;
  }

  public pageChanged(pageEvent: PageEvent): void {
    this.selection.clear();
    this.pageChange.emit(pageEvent);
  }

  public lastPage(): number {
    const total = this.length || this.dataSource().data.length;
    return Math.max(0, Math.ceil(total / (this.pageSize() || 1)) - 1);
  }

  /** "1 – 10 of 42", like the paginator it replaced. */
  public rangeLabel(): string {
    const total = this.length || this.dataSource().data.length;
    if (total === 0) {
      return this.translation.t("0 of 0");
    }

    const start = this.page() * this.pageSize();
    return this.translation.t("{from} – {to} of {total}", { from: start + 1, to: Math.min(start + this.pageSize(), total), total });
  }

  public goTo(pageIndex: number): void {
    const target = Math.min(Math.max(0, pageIndex), this.lastPage());
    this.pageChanged({ pageIndex: target, previousPageIndex: this.page(), pageSize: this.pageSize(), length: this.length });
  }

  public pageSizeChanged(value: string | number): void {
    this.pageChanged({ pageIndex: 0, previousPageIndex: this.page(), pageSize: Number(value), length: this.length });
  }

  public expanderClicked(event: MouseEvent, row: any): void {
    this.expandedElement = this.expandedElement === row ? null : row;
    event.stopPropagation();
  }
}
