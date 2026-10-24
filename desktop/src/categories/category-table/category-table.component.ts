import { AfterViewInit, Component, OnInit, signal, TemplateRef, viewChild, inject, ChangeDetectionStrategy } from "@angular/core";
import { AppDialog } from "../../dialog/app-dialog";
import { PageEvent, Sort, TableDataSource } from "../../table/table-types";
import { Store } from "@ngxs/store";
import { of, switchMap, take, tap } from "rxjs";
import { DEFAULT_DIALOG_CONFIG } from "src/constants";
import { ConfirmationDialogComponent } from "src/shared-ui/confirmation-dialog/confirmation-dialog.component";
import { CategoryTableState } from "src/store/category-table.state";
import { TableColumn } from "src/table/table-column.interface";
import { TableComponent } from "src/table/table/table.component";
import { CategoryService, CategoryView, PagedDataDataInner, PagedRequestCommand, Permission } from "../../open-api";
import { SnackbarService } from "../../services";
import { AppInitService } from "../../services/app-init.service";
import { SetOrderBy, SetPage, SetPageSize, SetSortDirection } from "../../store/category-table.state.actions";
import { CategoryForm } from "../category-form/category-form.component";
import { marker } from "../../i18n/marker";
import { TranslationService } from "../../i18n/translation.service";

@Component({
    selector: "app-category-table",
    templateUrl: "./category-table.component.html",
    styleUrls: ["./category-table.component.scss"],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class CategoryTableComponent implements OnInit, AfterViewInit {
  private readonly translation = inject(TranslationService);

  private readonly appInitService = inject(AppInitService);

  public readonly nameCell = viewChild.required<TemplateRef<any>>("nameCell");

  public readonly descriptionCell = viewChild.required<TemplateRef<any>>("descriptionCell");

  public readonly numberOfReceiptsCell = viewChild.required<TemplateRef<any>>("numberOfReceiptsCell");

  public readonly actionsCell = viewChild.required<TemplateRef<any>>("actionsCell");

  public readonly table = viewChild.required(TableComponent);

  public state = this.store.selectSignal(CategoryTableState.state);

  protected readonly Permission = Permission;

  constructor(
    private categoryService: CategoryService,
    private matDialog: AppDialog,
    private snackbarService: SnackbarService,
    private store: Store,
  ) {}

  public dataSource = signal(new TableDataSource<PagedDataDataInner>([]));

  public displayedColumns: string[] = [];

  public columns: TableColumn[] = [];

  public totalCount = signal(0);

  public readonly emptyText = marker("No categories yet. The AI adds them as it reads receipts, or add your own.");

  /** Set after the first answer, so the empty state never shows before the list has loaded. */
  public loaded = signal(false);

  public headerText: string = "Categories";

  public ngOnInit(): void {
    this.initTableData();
  }

  public ngAfterViewInit(): void {
    this.initTable();
  }

  private initTableData(): void {
    this.getCategories();
  }

  /**
   * After an add, edit or delete: reload the list, and the app data the receipt pickers read their
   * choices from (loaded at sign-in), so a new or renamed one can be picked at once. A failed reload
   * only leaves the pickers as they were.
   */
  private refreshAfterChange(): void {
    this.getCategories();
    this.appInitService.getAppData().pipe(take(1)).subscribe({ error: () => undefined });
  }

  private getCategories(): void {
    const command: PagedRequestCommand = this.store.selectSnapshot(
      CategoryTableState.state
    );

    this.categoryService
      .getPagedCategories(command)
      .pipe(
        take(1),
        tap((pagedData) => {
          this.dataSource.set(new TableDataSource<PagedDataDataInner>(
            pagedData.data
          ));
          this.totalCount.set(pagedData.totalCount);
          this.loaded.set(true);
        })
      )
      .subscribe();
  }

  public updatePageData(pageEvent: PageEvent) {
    const newPage = pageEvent.pageIndex + 1;

    this.store.dispatch(new SetPage(newPage));
    this.store.dispatch(new SetPageSize(pageEvent.pageSize));

    this.getCategories();
  }

  public sorted(sortState: Sort): void {
    this.store.dispatch(new SetOrderBy(sortState.active));
    this.store.dispatch(new SetSortDirection(sortState.direction));

    this.getCategories();
  }

  private initTable(): void {
    this.setColumns();
  }

  private setColumns(): void {
    const columns = [
      {
        columnHeader: "Name",
        matColumnDef: "name",
        template: this.nameCell(),
        sortable: true,
      },
      {
        columnHeader: "Products",
        matColumnDef: "numberOfProducts",
        template: this.numberOfReceiptsCell(),
        sortable: true,
      },
      {
        columnHeader: "Description",
        matColumnDef: "description",
        template: this.descriptionCell(),
        sortable: true,
      },
      {
        columnHeader: marker("Actions"),
        matColumnDef: "actions",
        template: this.actionsCell(),
        sortable: false,
      },
    ] as TableColumn[];

    const tableState = this.store.selectSnapshot(CategoryTableState.state);
    if (tableState.orderBy) {
      const column = columns.find(c => c.matColumnDef === tableState.orderBy);
      if (column) {
        column.defaultSortDirection = tableState.sortDirection;
      }
    }

    this.columns = columns;
    this.displayedColumns = [
      "name",
      "description",
      "numberOfProducts",
      "actions",
    ];
  }

  public openEditDialog(categoryView: CategoryView): void {
    const dialogRef = this.matDialog.open(CategoryForm, DEFAULT_DIALOG_CONFIG);

    dialogRef.componentInstance.category = categoryView;
    dialogRef.componentInstance.headerText = this.translation.t("Edit {name}", { name: categoryView.name });

    dialogRef
      .afterClosed()
      .pipe(
        take(1),
        tap((refreshData) => {
          if (refreshData) {
            this.refreshAfterChange();
          }
        })
      )
      .subscribe();
  }

  public openAddDialog(): void {
    const dialogRef = this.matDialog.open(CategoryForm, DEFAULT_DIALOG_CONFIG);

    dialogRef.componentInstance.headerText = this.translation.t("Add Category");

    dialogRef
      .afterClosed()
      .pipe(
        take(1),
        tap((refreshData) => {
          if (refreshData) {
            this.refreshAfterChange();
          }
        })
      )
      .subscribe();
  }

  public openDeleteConfirmationDialog(categoryView: CategoryView) {
    const dialogRef = this.matDialog.open(
      ConfirmationDialogComponent,
      DEFAULT_DIALOG_CONFIG
    );

    dialogRef.componentInstance.headerText = this.translation.t("Delete {name}", { name: categoryView.name });
    dialogRef.componentInstance.confirmText = marker("Delete");
    dialogRef.componentInstance.dialogContent = this.translation.t("Are you sure you want to delete {name}? This action is irreversible and will remove this category from the receipts it is associated with.", { name: categoryView.name });

    dialogRef
      .afterClosed()
      .pipe(
        take(1),
        switchMap((confirmed) => {
          if (confirmed) {
            return this.categoryService.deleteCategory(categoryView.id).pipe(
              tap(() => {
                this.snackbarService.success("Category successfully deleted");
                this.refreshAfterChange();
              })
            );
          } else {
            return of(undefined);
          }
        })
      )
      .subscribe();
  }
}
