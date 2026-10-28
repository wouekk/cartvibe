import { AfterViewInit, Component, OnInit, signal, TemplateRef, viewChild, inject, ChangeDetectionStrategy } from "@angular/core";
import { AppDialog } from "../../dialog/app-dialog";
import { PageEvent, Sort, TableDataSource } from "../../table/table-types";
import { Store } from "@ngxs/store";
import { of, switchMap, take, tap } from "rxjs";
import { DEFAULT_DIALOG_CONFIG } from "src/constants";
import { ConfirmationDialogComponent } from "src/shared-ui/confirmation-dialog/confirmation-dialog.component";
import { TagTableState } from "src/store/tag-table.state";
import { TableColumn } from "src/table/table-column.interface";
import { TableComponent } from "src/table/table/table.component";
import { PagedDataDataInner, PagedRequestCommand, Permission, TagService, TagView } from "../../open-api";
import { SnackbarService } from "../../services";
import { AppInitService } from "../../services/app-init.service";
import { SetOrderBy, SetPage, SetPageSize, SetSortDirection } from "../../store/tag-table.state.actions";
import { TagFormComponent } from "../tag-form/tag-form.component";
import { marker } from "../../i18n/marker";
import { TranslationService } from "../../i18n/translation.service";

@Component({
    selector: "app-tags-list",
    templateUrl: "./tag-table.component.html",
    styleUrls: ["./tag-table.component.scss"],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class TagTableComponent implements OnInit, AfterViewInit {
  private readonly translation = inject(TranslationService);

  private readonly appInitService = inject(AppInitService);

  public readonly nameCell = viewChild.required<TemplateRef<any>>("nameCell");

  public readonly descriptionCell = viewChild.required<TemplateRef<any>>("descriptionCell");

  public readonly numberOfReceiptsCell = viewChild.required<TemplateRef<any>>("numberOfReceiptsCell");

  public readonly actionsCell = viewChild.required<TemplateRef<any>>("actionsCell");

  public readonly table = viewChild.required(TableComponent);

  public tagTableState = this.store.selectSignal(TagTableState.state);

  protected readonly Permission = Permission;

  constructor(
    private matDialog: AppDialog,
    private snackbarService: SnackbarService,
    private store: Store,
    private tagService: TagService
  ) {}

  public dataSource = signal(new TableDataSource<PagedDataDataInner>([]));

  public displayedColumns: string[] = [];

  public columns: TableColumn[] = [];

  public totalCount = signal(0);

  public readonly emptyText = marker("No tags yet. Add one, then tag products on your receipts.");

  /** Set after the first answer, so the empty state never shows before the list has loaded. */
  public loaded = signal(false);


  public ngOnInit(): void {
    this.initTableData();
  }

  public ngAfterViewInit(): void {
    this.initTable();
  }

  private initTableData(): void {
    this.getTags();
  }

  /**
   * After an add, edit or delete: reload the list, and the app data the receipt pickers read their
   * choices from (loaded at sign-in), so a new or renamed one can be picked at once. A failed reload
   * only leaves the pickers as they were.
   */
  private refreshAfterChange(): void {
    this.getTags();
    this.appInitService.getAppData().pipe(take(1)).subscribe({ error: () => undefined });
  }

  private getTags(): void {
    const command: PagedRequestCommand = this.store.selectSnapshot(
      TagTableState.state
    );

    this.tagService
      .getPagedTags(command)
      .pipe(
        take(1),
        tap((pagedData) => {
          this.dataSource.set(new TableDataSource<PagedDataDataInner>(pagedData.data));
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

    this.getTags();
  }

  public sorted(sortState: Sort): void {
    this.store.dispatch(new SetOrderBy(sortState.active));
    this.store.dispatch(new SetSortDirection(sortState.direction));

    this.getTags();
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
        columnHeader: marker("Products"),
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

    const state = this.store.selectSnapshot(TagTableState.state);
    if (state.orderBy) {
      const column = columns.find((c) => c.matColumnDef === state.orderBy);
      if (column) {
        column.defaultSortDirection = state.sortDirection;
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

  public openEditDialog(tagView: PagedDataDataInner): void {
    const dialogRef = this.matDialog.open(
      TagFormComponent,
      DEFAULT_DIALOG_CONFIG
    );

    dialogRef.componentInstance.tag = tagView as TagView;
    dialogRef.componentInstance.headerText = this.translation.t("Edit {name}", { name: tagView.name });

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
    const dialogRef = this.matDialog.open(
      TagFormComponent,
      DEFAULT_DIALOG_CONFIG
    );

    dialogRef.componentInstance.headerText = this.translation.t("Add Tag");

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

  public openDeleteConfirmationDialog(tagView: PagedDataDataInner) {
    const dialogRef = this.matDialog.open(
      ConfirmationDialogComponent,
      DEFAULT_DIALOG_CONFIG
    );
    dialogRef.componentInstance.headerText = this.translation.t("Delete {name}", { name: tagView.name });
    dialogRef.componentInstance.confirmText = marker("Delete");
    dialogRef.componentInstance.dialogContent = this.translation.t("Are you sure you want to delete {name}? This action is irreversible and will remove this tag from the receipts it is associated with.", { name: tagView.name });
    dialogRef
      .afterClosed()
      .pipe(
        take(1),
        switchMap((confirmed) => {
          if (confirmed) {
            return this.tagService.deleteTag(tagView.id as number).pipe(
              tap(() => {
                this.snackbarService.success("Tag successfully deleted");
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
