import { AuthStore } from "../../store";
import { RowAction, RowActionsComponent } from "../../shared-ui/row-actions/row-actions.component";
import { AfterViewInit, Component, OnInit, signal, TemplateRef, viewChild, inject, ChangeDetectionStrategy, computed } from "@angular/core";
import { AppDialog } from "../../dialog/app-dialog";
import { PageEvent, Sort, TableDataSource } from "../../table/table-types";
import { of, switchMap, take, tap } from "rxjs";
import { DEFAULT_DIALOG_CONFIG } from "src/constants";
import { ConfirmationDialogComponent } from "src/shared-ui/confirmation-dialog/confirmation-dialog.component";
import { CategoryTableStore } from "src/store/category-table.store";
import { TableColumn } from "src/table/table-column.interface";
import { TableComponent } from "src/table/table/table.component";
import { CategoryService, CategoryView, PagedDataDataInner, PagedRequestCommand, Permission } from "../../open-api";
import { SnackbarService } from "../../services";
import { AppInitService } from "../../services/app-init.service";
import { CategoryForm } from "../category-form/category-form.component";
import { marker } from "../../i18n/marker";
import { TranslationService } from "../../i18n/translation.service";
import { SettingsPageComponent } from "../../shared-ui/settings/settings-page.component";
import { ManagementTabsComponent } from "../../shared-ui/management-tabs/management-tabs.component";
import { HasAppPermissionDirective } from "../../directives/has-app-permission.directive";
import { AddButtonComponent } from "../../shared-ui/add-button/add-button.component";
import { SettingsEntityListComponent } from "../../shared-ui/settings/settings-entity-list.component";
import { TranslatePipe } from "../../i18n/translate.pipe";

@Component({
    selector: "app-category-table",
    templateUrl: "./category-table.component.html",
    styleUrls: ["./category-table.component.scss"],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [SettingsPageComponent, ManagementTabsComponent, HasAppPermissionDirective, AddButtonComponent, SettingsEntityListComponent, TableComponent, RowActionsComponent, TranslatePipe]
})
export class CategoryTableComponent implements OnInit, AfterViewInit {
  private readonly authStore = inject(AuthStore);

  private readonly categoryTableStore = inject(CategoryTableStore);

  private readonly translation = inject(TranslationService);

  private readonly appInitService = inject(AppInitService);

  public readonly nameCell = viewChild.required<TemplateRef<any>>("nameCell");

  public readonly descriptionCell = viewChild.required<TemplateRef<any>>("descriptionCell");

  public readonly numberOfReceiptsCell = viewChild.required<TemplateRef<any>>("numberOfReceiptsCell");

  public readonly actionsCell = viewChild.required<TemplateRef<any>>("actionsCell");

  public readonly table = viewChild.required(TableComponent);

  public state = this.categoryTableStore.state;

  protected readonly Permission = Permission;

  private readonly canUpdate = computed(() => this.authStore.hasAppPermission(Permission.AppCategoriesUpdate));

  private readonly canDelete = computed(() => this.authStore.hasAppPermission(Permission.AppCategoriesDelete));

  /** The row's actions (app-row-actions): inline icons on a wider screen, a menu on a phone. */
  public readonly rowActions: readonly RowAction<CategoryView>[] = [
    { key: "edit", label: marker("Edit"), icon: "edit", testId: "category-edit", visible: () => this.canUpdate() },
    {
      key: "delete",
      label: marker("Delete"),
      icon: "delete",
      testId: "category-delete",
      destructive: true,
      visible: () => this.canDelete(),
    },
  ];

  public rowAction(key: string, row: CategoryView): void {
    if (key === "edit") {
      this.openEditDialog(row);
    } else if (key === "delete") {
      this.openDeleteConfirmationDialog(row);
    }
  }

  constructor(
    private categoryService: CategoryService,
    private dialog: AppDialog,
    private snackbarService: SnackbarService
  ) {}

  public dataSource = signal(new TableDataSource<PagedDataDataInner>([]));

  public displayedColumns: string[] = [];

  public columns: TableColumn[] = [];

  public totalCount = signal(0);

  public readonly emptyText = marker("No categories yet. The AI adds them as it reads receipts, or add your own.");

  /** Set after the first answer, so the empty state never shows before the list has loaded. */
  public loaded = signal(false);


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
    const command: PagedRequestCommand = this.categoryTableStore.state();

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

    this.categoryTableStore.setPage(newPage);
    this.categoryTableStore.setPageSize(pageEvent.pageSize);

    this.getCategories();
  }

  public sorted(sortState: Sort): void {
    this.categoryTableStore.setOrderBy(sortState.active);
    this.categoryTableStore.setSortDirection(sortState.direction);

    this.getCategories();
  }

  private initTable(): void {
    this.setColumns();
  }

  private setColumns(): void {
    const columns = [
      {
        columnHeader: "Name",
        columnDef: "name",
        template: this.nameCell(),
        sortable: true,
      },
      {
        columnHeader: "Products",
        columnDef: "numberOfProducts",
        template: this.numberOfReceiptsCell(),
        sortable: true,
      },
      {
        columnHeader: "Description",
        columnDef: "description",
        template: this.descriptionCell(),
        sortable: true,
      },
      {
        columnHeader: marker("Actions"),
        columnDef: "actions",
        template: this.actionsCell(),
        sortable: false,
      },
    ] as TableColumn[];

    const tableState = this.categoryTableStore.state();
    if (tableState.orderBy) {
      const column = columns.find(c => c.columnDef === tableState.orderBy);
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
    const dialogRef = this.dialog.open(CategoryForm, DEFAULT_DIALOG_CONFIG);

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
    const dialogRef = this.dialog.open(CategoryForm, DEFAULT_DIALOG_CONFIG);

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
    const dialogRef = this.dialog.open(
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
