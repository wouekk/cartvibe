import { TranslationService } from "../../i18n/translation.service";
import { CurrencyPipe, DatePipe } from "@angular/common";
import { AfterViewInit, Component, computed, HostListener, inject, OnInit, signal, TemplateRef, viewChild, ChangeDetectionStrategy } from "@angular/core";
import { AppDialog } from "../../dialog/app-dialog";
import { PageEvent, Sort, TableDataSource } from "../../table/table-types";
import { ActivatedRoute, Router } from "@angular/router";
import { UntilDestroy, untilDestroyed } from "@ngneat/until-destroy";
import { Store } from "@ngxs/store";
import { DONE_STATUSES } from "../../utils/receipt-status";
import { ResolvedPeriod } from "../../overview/overview-period";
import { catchError, debounceTime, distinctUntilChanged, EMPTY, filter as rxFilter, map, Subject, switchMap, take, tap } from "rxjs";
import { fadeInOut } from "src/animations";
import { ReceiptFilterService } from "src/services/receipt-filter.service";
import { ConfirmationDialogComponent } from "src/shared-ui/confirmation-dialog/confirmation-dialog.component";
import { ResetReceiptFilter, SetColumnConfig, SetPage, SetPageSize, SetQuickDateField, SetReceiptFilterData, SetReceiptFilterField, SetReceiptSearch } from "src/store/receipt-table.actions";
import { DEFAULT_RECEIPT_ORDER_BY, DEFAULT_RECEIPT_SORT_DIRECTION, ReceiptTableState, } from "src/store/receipt-table.state";
import { SystemSettingsState } from "src/store/system-settings.state";
import { TableColumn } from "src/table/table-column.interface";
import { TableComponent } from "src/table/table/table.component";
import { DEFAULT_DIALOG_CONFIG, DEFAULT_HOST_CLASS, RECEIPT_DATE_FILTER_FIELDS, ReceiptDateFilterFieldKey } from "../../constants";
import { ReceiptTableColumnConfig } from "../../interfaces";
import {
  BulkStatusUpdateCommand,
  Category,
  FilterOperation,
  Group,
  GroupsService,
  PagedDataDataInner,
  Permission,
  Receipt,
  ReceiptPagedRequestFilter,
  ReceiptService,
  ReceiptProductService,
  ReceiptStatus,
  Tag,
} from "../../open-api";
import { SnackbarService } from "../../services";
import { ReceiptExportService } from "../../services/receipt-export.service";
import { ReceiptFilterComponent } from "../../shared-ui/receipt-filter/receipt-filter.component";
import { AuthState, GroupState, UserState } from "../../store";
import { CustomCurrencyPipe } from "../../pipes/custom-currency.pipe";
import {
  applyFormCommand,
  reconcileColumns,
  RECEIPT_COLUMN_DISPLAY_NAMES,
} from "../../utils/index";
import { FilterMonth, monthFilterEntry, monthFromFilterEntry } from "../../utils/receipt-date-filter";
import { buildReceiptFilterForm } from "../../utils/receipt-filter";
import { buildReceiptFilterChips, ReceiptFilterChip } from "../../utils/receipt-filter-chips";
import { isFilterEntryActive } from "../../utils/receipt-filter-entry";
import { QuickScanLauncher } from "../quick-scan-dialog/quick-scan-launcher.service";
import { BulkStatusUpdateComponent } from "../bulk-resolve-dialog/bulk-status-update-dialog.component";
import { ColumnConfigurationDialogComponent } from "../column-configuration-dialog/column-configuration-dialog.component";
import { marker } from "../../i18n/marker";

@UntilDestroy()
@Component({
  selector: "app-receipts-table",
  templateUrl: "./receipts-table.component.html",
  animations: [fadeInOut],
  host: DEFAULT_HOST_CLASS,
  // The chip labels are built in TS rather than the template, so the formatting
  // pipes are injected. CustomCurrencyPipe is declared in PipesModule and needs
  // CurrencyPipe, neither of which is providedIn: "root".
  providers: [CurrencyPipe, CustomCurrencyPipe, DatePipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class ReceiptsTableComponent implements OnInit, AfterViewInit {
  constructor(
    private activatedRoute: ActivatedRoute,
    private groupsService: GroupsService,
    private matDialog: AppDialog,
    private receiptExportService: ReceiptExportService,
    private receiptFilterService: ReceiptFilterService,
    private receiptService: ReceiptService,
    private router: Router,
    private snackbarService: SnackbarService,
    private store: Store,
    private customCurrencyPipe: CustomCurrencyPipe,
    private datePipe: DatePipe,
    private translation: TranslationService,
  ) {
    this.listenForRefreshRequests();
    this.listenForSearchInput();
  }

  readonly dateCell = viewChild.required<TemplateRef<any>>("dateCell");

  readonly shopCell = viewChild.required<TemplateRef<any>>("shopCell");
  readonly addedByCell = viewChild.required<TemplateRef<any>>("addedByCell");

  readonly amountCell = viewChild.required<TemplateRef<any>>("amountCell");

  readonly categoryCell = viewChild.required<TemplateRef<any>>("categoryCell");

  readonly tagCell = viewChild.required<TemplateRef<any>>("tagCell");

  readonly statusCell = viewChild.required<TemplateRef<any>>("statusCell");

  readonly resolvedDateCell = viewChild.required<TemplateRef<any>>("resolvedDateCell");

  readonly firstCommentCell = viewChild.required<TemplateRef<any>>("firstCommentCell");

  readonly actionsCell = viewChild.required<TemplateRef<any>>("actionsCell");

  readonly table = viewChild.required(TableComponent);

  public page = this.store.selectSignal(ReceiptTableState.page);

  public pageSize = this.store.selectSignal(ReceiptTableState.pageSize);

  public filter = this.store.selectSignal(ReceiptTableState.filterData);

  /** The phrase applied to the table, as the store holds it. */
  private readonly appliedSearch = this.store.selectSignal(ReceiptTableState.search);

  /** What the search box shows: ahead of the store while the debounce waits. */
  public readonly searchText = signal(this.store.selectSnapshot(ReceiptTableState.search));

  private readonly searchTyped = new Subject<string>();

  public columnConfig = this.store.selectSignal(ReceiptTableState.columnConfig);

  public selectedGroupId = this.store.selectSignal(GroupState.selectedGroupId);

  private readonly refreshRequested = new Subject<void>();

  private groups = this.store.selectSignal(GroupState.groups);

  private users = this.store.selectSignal(UserState.users);

  private receiptFilter = computed(
    () => this.filter()?.filter as ReceiptPagedRequestFilter | undefined
  );

  /** The date field the quick date control writes to. */
  public quickDateField = this.store.selectSignal(ReceiptTableState.quickDateField);

  /** The app time zone, which decides the month stepper's "this month". */
  public timeZone = this.store.selectSignal(SystemSettingsState.timeZone);

  public readonly dateFilterFields = RECEIPT_DATE_FILTER_FIELDS;

  public quickDateFieldLabel = computed(
    () =>
      RECEIPT_DATE_FILTER_FIELDS.find((field) => field.key === this.quickDateField())?.label ??
      "Receipt Date"
  );

  /** The entry the quick date control currently owns. */
  private quickDateEntry = computed(() => this.receiptFilter()?.[this.quickDateField()]);

  /**
   * The month the quick date control is showing, or null when its field is
   * unset or holds something a month cannot express.
   */
  public stepperMonth = computed(() => monthFromFilterEntry(this.quickDateEntry()));

  public stepperLabel = computed(() => {
    const month = this.stepperMonth();
    if (month) {
      return this.datePipe.transform(new Date(month.year, month.month, 1), "LLLL y") ?? "";
    }

    // A filter the stepper cannot describe still has to be visible as a
    // filter — the chip below spells out what it actually is.
    return isFilterEntryActive(this.quickDateEntry()) ? "Custom" : "All time";
  });

  public filterChips = computed<ReceiptFilterChip[]>(() => {
    const categories = this.categories();
    const tags = this.tags();
    const groups = this.groups();
    const users = this.users();

    return buildReceiptFilterChips(
      this.receiptFilter(),
      {
        categories,
        tags,
        // Not groupsWithoutAll: a group filter set on the All Groups view is
        // persisted, so it can outlive the view that offers the control and
        // still has to name itself here.
        groups,
        users,
        // Not appDate: a filter value is the day the user PICKED, held as a
        // local-midnight Date (or its ISO string once persisted), so it is read
        // on the browser's calendar — the same day toDateWireFilter sends.
        formatDate: (value) => this.datePipe.transform(value as string) ?? "",
        formatCurrency: (value) => this.customCurrencyPipe.transform(value as number),
        translate: (text) => this.translation.t(text),
      }
    );
  });

  private numFiltersAppliedRaw = this.store.selectSignal(ReceiptTableState.numFiltersApplied);

  /**
   * Every active condition, the date range included: what Reset clears.
   */
  public anyFilterApplied = computed(() => this.numFiltersAppliedRaw() > 0 || this.appliedSearch().length > 0);

  /**
   * The Filter button's badge. The Receipt Date range is already on show in the period picker beside
   * it, so it is not counted: the badge only speaks for what the filter dialog holds.
   */
  public numFiltersApplied = computed(() => {
    const dateActive = isFilterEntryActive((this.receiptFilter() as any)?.date) ? 1 : 0;
    const num = this.numFiltersAppliedRaw() - dateActive;
    return num > 0 ? num : undefined;
  });


  public categories = signal<Category[]>([]);

  public tags = signal<Tag[]>([]);

  public groupId: string = "0";

  public dataSource = signal(new TableDataSource<PagedDataDataInner>([]));

  public displayedColumns = signal<string[]>([]);

  public columns = signal<TableColumn[]>([]);

  public totalCount = signal(0);

  public selectedReceiptIds = signal<number[]>([]);

  public firstSort: boolean = true;

  public canEdit: boolean = false;

  public canCreate: boolean = false;

  public canQuickScan: boolean = false;


  public headerText: string = "";

  public group?: Group;

  protected readonly Permission = Permission;

  public ngOnInit(): void {
    this.groupId = this.store
      .selectSnapshot(GroupState.selectedGroupId)
      ?.toString();
    this.setGroup();
    this.setCanEdit();

    this.setHeaderText();

    // Filter options come from the selected group's AppData catalog (filtered to
    // the user's grants), so a restricted user can't filter by a hidden one.
    const numericGroupId = Number(this.groupId);
    this.categories.set(
      Number.isNaN(numericGroupId)
        ? []
        : this.store.selectSnapshot(AuthState.groupCategories(numericGroupId))
    );
    this.tags.set(
      Number.isNaN(numericGroupId)
        ? []
        : this.store.selectSnapshot(AuthState.groupTags(numericGroupId))
    );

    this.reconcileColumnConfig();

    this.getInitialData();
    // getInitialData stays on its own one-shot subscription because it owns the single setColumns() call.
  }

  /**
   * Brings the persisted column configuration back in line with the columns that
   * exist now, before anything reads it.
   *
   * Both halves matter on the *first* load. The configuration and the sort are
   * persisted to localStorage and are shared by every account using the browser,
   * so the table can start up holding a column that no longer exists. A stale
   * column would make mat-table render an
   * id it has no definition for; a stale sort would make the very first request
   * ask the API to order by a column that no longer exists.
   */
  private reconcileColumnConfig(): void {
    const persisted = this.store.selectSnapshot(
      ReceiptTableState.columnConfig
    );
    const reconciled = reconcileColumns(persisted);

    const changed =
      reconciled.length !== persisted.length ||
      reconciled.some(
        (column, index) =>
          column.matColumnDef !== persisted[index].matColumnDef ||
          column.visible !== persisted[index].visible ||
          column.order !== persisted[index].order
      );

    if (changed) {
      this.store.dispatch(new SetColumnConfig(reconciled));
    }

    const filterData = this.store.selectSnapshot(ReceiptTableState.filterData);
    const isKnownColumn = reconciled.some(
      (column) => column.matColumnDef === filterData.orderBy
    );

    if (!isKnownColumn) {
      this.store.dispatch(
        new SetReceiptFilterData({
          ...filterData,
          orderBy: DEFAULT_RECEIPT_ORDER_BY,
          sortDirection: DEFAULT_RECEIPT_SORT_DIRECTION,
        })
      );
    }
  }

  private setGroup(): void {
    this.group = this.store.selectSnapshot(GroupState.getGroupById(this.groupId));
  }

  private getInitialData(): void {
    this.receiptFilterService
      .getPagedReceiptsForGroups(this.groupId)
      .pipe(
        take(1),
        tap((pagedData) => {
          this.dataSource.set(new TableDataSource<PagedDataDataInner>(pagedData.data));
          this.totalCount.set(pagedData.totalCount);
          this.setColumns();
        })
      )
      .subscribe();
  }

  private setCanEdit(): void {
    const groupId = Number.parseInt(this.groupId);
    this.canEdit = this.store.selectSnapshot(
      AuthState.hasGroupPermission(groupId, Permission.GroupReceiptsUpdate)
    );
    this.canCreate = this.store.selectSnapshot(
      AuthState.hasGroupPermission(groupId, Permission.GroupReceiptsCreate)
    );
    this.canQuickScan = this.store.selectSnapshot(
      AuthState.hasGroupPermission(groupId, Permission.GroupReceiptsQuickScan)
    );
  }

  private setHeaderText(): void {
    const group = this.store.selectSnapshot(
      GroupState.getGroupById(this.groupId)
    );
    if (group) {
      if (group.name.toLowerCase().includes("receipt")) {
        this.headerText = group.name;
      } else {
        this.headerText = `${group.name} Receipts`;
      }
    }
  }

  public ngAfterViewInit(): void {
    this.setSelectedReceiptIdsObservable();
  }

  private setSelectedReceiptIdsObservable(): void {
    this.table()?.selection?.changed
      .pipe(
        untilDestroyed(this),
        map((event) => (event.source.selected as Receipt[]).map((r) => r.id)),
        tap((ids) => this.selectedReceiptIds.set(ids))
      )
      .subscribe();
  }

  private setColumns(): void {
    const currentColumnConfig = this.store.selectSnapshot(ReceiptTableState.columnConfig);

    const allColumns = [
      {
        columnHeader: "Receipt Date",
        matColumnDef: "date",
        template: this.dateCell(),
        sortable: true,
      },
      {
        // The clickable Shop: the shop printed on the receipt (Auchan, Edeka, Rewe), read by the AI, or
        // the receipt's name when none was read. It sorts the same way (shop_name on the API).
        columnHeader: RECEIPT_COLUMN_DISPLAY_NAMES["shop_name"],
        matColumnDef: "shop_name",
        template: this.shopCell(),
        sortable: true,
      },
      {
        // Who added the receipt (the paid by user, which a family does not distinguish).
        columnHeader: RECEIPT_COLUMN_DISPLAY_NAMES["paid_by_user_id"],
        matColumnDef: "paid_by_user_id",
        template: this.addedByCell(),
        sortable: true,
      },
      {
        columnHeader: "Amount",
        matColumnDef: "amount",
        template: this.amountCell(),
        sortable: true,
      },
      {
        columnHeader: "Categories",
        matColumnDef: "categories",
        template: this.categoryCell(),
        sortable: false,
      },
      {
        columnHeader: "Tags",
        matColumnDef: "tags",
        template: this.tagCell(),
        sortable: false,
      },
      {
        columnHeader: "Status",
        matColumnDef: "status",
        template: this.statusCell(),
        sortable: true,
      },
      {
        columnHeader: "Settled on",
        matColumnDef: "resolved_date",
        template: this.resolvedDateCell(),
        sortable: true,
      },
      {
        // The receipt's first comment, which the API both returns
        // (firstComment) and sorts on under this same key.
        columnHeader: RECEIPT_COLUMN_DISPLAY_NAMES["first_comment"],
        matColumnDef: "first_comment",
        template: this.firstCommentCell(),
        sortable: true,
      },
    ] as TableColumn[];


    // Filter and order columns based on configuration
    const visibleColumnConfigs = currentColumnConfig
      .filter(config => config.visible)
      .sort((a, b) => a.order - b.order);

    const columns = visibleColumnConfigs
      .map(config => allColumns.find(col => col.matColumnDef === config.matColumnDef))
      .filter(col => col !== undefined) as TableColumn[];

    if (this.canEdit) {
      columns.push({
        columnHeader: marker("Actions"),
        matColumnDef: "actions",
        template: this.actionsCell(),
        sortable: false,
      });
    }

    // Derived from the columns that actually resolved, never from the stored
    // configuration: mat-table throws on a displayed id it has no definition for,
    // and a configuration naming a since-removed column is ordinary.
    const displayColumns = ["select", ...columns.map(col => col.matColumnDef)];

    const filter = this.store.selectSnapshot(ReceiptTableState.filterData);
    const orderByIndex = columns.findIndex(
      (c) => c.matColumnDef === filter.orderBy
    );

    if (orderByIndex >= 0) {
      columns[orderByIndex].defaultSortDirection = filter.sortDirection;
    } else if (columns.length > 0) {
      columns[0].defaultSortDirection = "desc";
    }

    this.columns.set(columns);
    this.displayedColumns.set(displayColumns);
  }

  public sort(sortState: Sort): void {
    if (!this.firstSort) {
      const filterData = this.store.selectSnapshot(
        ReceiptTableState.filterData
      );

      this.store.dispatch(
        new SetReceiptFilterData({
          page: filterData.page,
          pageSize: filterData.pageSize,
          orderBy: sortState.active,
          sortDirection: sortState.direction,
          filter: filterData.filter,
        })
      );

      this.getFilteredReceipts();
    }
    this.firstSort = false;
  }

  public filterButtonClicked(): void {
    const filter = this.store.selectSnapshot(ReceiptTableState.filterData).filter as any;

    const dialogRef = this.matDialog.open(ReceiptFilterComponent, {
      minWidth: "75%",
      maxWidth: "100%",
    });

    dialogRef.componentInstance.categories = this.categories();
    dialogRef.componentInstance.tags = this.tags();
    dialogRef.componentInstance.parentForm = buildReceiptFilterForm(filter, this);
    dialogRef.componentInstance.headerText = "Filter Receipts";
    // The group filter is only meaningful on the "All groups" view; a
    // single-group view is already scoped to one group.
    dialogRef.componentInstance.showGroupFilter = this.group?.isAllGroup ?? false;
    const formCommandSubscription = dialogRef.componentInstance.formCommand.subscribe((formCommand) => {
      applyFormCommand(dialogRef.componentInstance.parentForm, formCommand);
    });

    dialogRef
      .afterClosed()
      .pipe(
        take(1),
        tap((applyFilter) => {
          if (applyFilter) {
            this.store.dispatch(new SetPage(1));
            this.getFilteredReceipts();
          }

          formCommandSubscription.unsubscribe();
        })
      )
      .subscribe();
  }

  /**
   * The period picker's choice becomes the Receipt Date filter, a closed range of calendar days. An
   * incomplete custom range changes nothing until it is complete.
   */
  public periodSelected(period: ResolvedPeriod | undefined): void {
    if (!period) {
      return;
    }

    this.applyFilterField("date", {
      operation: FilterOperation.Between,
      value: [dayKeyToLocalDate(period.from), dayKeyToLocalDate(period.to)],
    } as any);
  }

  public monthSelected(month: FilterMonth): void {
    // The quick control IS its field's filter, so it overwrites whatever was there.
    this.applyFilterField(this.quickDateField(), monthFilterEntry(month) as any);
  }

  public allTimeSelected(): void {
    this.applyFilterField(this.quickDateField(), null);
  }

  /**
   * Re-points the quick date control at another date field. Deliberately
   * non-destructive: it changes no condition — only which one the stepper
   * describes — so whatever the previous field held stays applied and keeps its
   * chip. Nothing to refetch.
   */
  public quickDateFieldSelected(field: ReceiptDateFilterFieldKey): void {
    this.store.dispatch(new SetQuickDateField(field));
  }

  public filterChipCleared(field: keyof ReceiptPagedRequestFilter): void {
    this.applyFilterField(field, null);
  }

  /**
   * The one write path for a single-field filter change, so the page reset and
   * the refetch can never be forgotten — narrowing a filter while on page 7
   * would otherwise land on an empty page.
   */
  private applyFilterField(
    field: keyof ReceiptPagedRequestFilter,
    entry: { operation: FilterOperation | null; value: unknown } | null
  ): void {
    this.store.dispatch(new SetReceiptFilterField(field, entry));
    this.store.dispatch(new SetPage(1));
    this.getFilteredReceipts();
  }

  private readonly quickScanLauncher = inject(QuickScanLauncher);

  public quickScanClicked(): void {
    this.quickScanLauncher
      .open()
      .pipe(
        take(1),
        tap(() => this.getFilteredReceipts())
      )
      .subscribe();
  }

  public exportAllReceipts(): void {
    this.receiptExportService.exportReceiptsFromFilter(this.groupId, this.filter());
  }

  public resetFilterButtonClicked(): void {
    this.store.dispatch(new ResetReceiptFilter());
    this.searchText.set("");
    this.getFilteredReceipts();
  }

  public searchInput(value: string): void {
    this.searchText.set(value);
    this.searchTyped.next(value);
  }

  public clearSearch(): void {
    this.searchText.set("");
    this.applySearch("");
  }

  /** Typing waits 300 ms for a pause before asking the server, so a phrase is not searched letter by letter. */
  private listenForSearchInput(): void {
    this.searchTyped
      .pipe(
        map((value) => value.trim()),
        debounceTime(300),
        distinctUntilChanged(),
        rxFilter((value) => value !== this.appliedSearch()),
        untilDestroyed(this)
      )
      .subscribe((value) => this.applySearch(value));
  }

  private applySearch(value: string): void {
    this.store.dispatch(new SetReceiptSearch(value));
    this.getFilteredReceipts();
  }

  /** Ctrl K / Cmd K, or / outside a text field, jumps to the search box. */
  @HostListener("document:keydown", ["$event"])
  public handleSearchShortcut(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const typing = !!target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
    const commandK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
    if (commandK || (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey)) {
      const input = document.querySelector<HTMLInputElement>("[data-testid=receipts-search]");
      if (input) {
        event.preventDefault();
        input.focus();
        input.select();
      }
    }
  }

  /** The line under a shop that says which products matched the search. */
  public searchMatchesText(receipt: any): string {
    return ((receipt?.searchMatches ?? []) as { name: string; amount?: string }[])
      .map((match) => (match.amount ? `${match.name} · ${this.customCurrencyPipe.transform(match.amount)}` : match.name))
      .join(", ");
  }

  public configureColumnsButtonClicked(): void {
    const currentColumnConfig = this.store.selectSnapshot(ReceiptTableState.columnConfig);

    const dialogRef = this.matDialog.open(ColumnConfigurationDialogComponent, {
      ...DEFAULT_DIALOG_CONFIG,
      data: {
        currentColumns: currentColumnConfig,
      }
    });

    dialogRef
      .afterClosed()
      .pipe(
        take(1),
        tap((result: ReceiptTableColumnConfig[] | null) => {
          if (result) {
            this.store.dispatch(new SetColumnConfig(result));
            this.setColumns();
          }
        })
      )
      .subscribe();
  }

  /**
   * The filter changed, or receipts were mutated, or the page or sort changed: refresh the page.
   */
  public getFilteredReceipts(): void {
    this.refreshRequested.next();
  }

  /**
   * Every refresh goes through one switchMap, so a newer request supersedes
   * whatever is in flight (and aborts its XHR) instead of racing it. Without
   * this the last *response* wins rather than the last *request* — and the
   * quick date arrows put those one click apart, so a slow earlier page could
   * repaint the table with a month the user has already stepped past.
   */
  private listenForRefreshRequests(): void {
    this.refreshRequested
      .pipe(
        untilDestroyed(this),
        switchMap(() =>
          this.receiptFilterService.getPagedReceiptsForGroups(this.groupId.toString()).pipe(
            // Keeps the outer subscription alive. An error surfacing through
            // switchMap would complete it and silently kill every later
            // refresh; the HTTP interceptor already reports the failure.
            catchError(() => EMPTY)
          )
        ),
        tap((pagedData) => {
          this.dataSource.set(new TableDataSource(pagedData.data));
          this.totalCount.set(pagedData.totalCount);
        })
      )
      .subscribe();
  }

  public deleteReceipt(row: Receipt): void {
    const dialogRef = this.matDialog.open(ConfirmationDialogComponent);

    dialogRef.componentInstance.headerText = marker("Delete Receipt");
    dialogRef.componentInstance.dialogContent = this.translation.t("Are you sure you would like to delete the receipt {name}? This action is irreversible.", { name: row.name });

    dialogRef
      .afterClosed()
      .pipe(
        take(1),
        tap((r) => {
          if (r) {
            this.receiptService
              .deleteReceiptById(row.id as number)
              .pipe(
                take(1),
                tap(() => {
                  this.dataSource.update(ds => new TableDataSource(ds.data.filter(
                    (r) => r.id !== row.id
                  )));
                  this.snackbarService.success("Receipt successfully deleted");
                })
              )
              .subscribe();
          }
        })
      )
      .subscribe();
  }

  private readonly receiptProductService = inject(ReceiptProductService);

  /** A receipt that reads as "Done" needs no check mark (Phase 3 2e). */
  public isDone(row: Receipt): boolean {
    return DONE_STATUSES.includes(row.status);
  }

  /** The "V" on a row: sets the receipt to Done (RESOLVED) in one tap, without opening it. */
  public markDone(row: Receipt): void {
    this.receiptService
      .bulkReceiptStatusUpdate({ status: ReceiptStatus.Resolved, receiptIds: [row.id] })
      .pipe(
        take(1),
        tap((receipts) => {
          const newReceipts = Array.from(this.dataSource().data);
          receipts.forEach((updated) => {
            const inTable = newReceipts.find((candidate) => candidate.id === updated.id) as any as Receipt;
            if (inTable) {
              inTable.status = updated.status;
              inTable.resolvedDate = updated.resolvedDate;
            }
          });
          this.dataSource.set(new TableDataSource(newReceipts));
          this.snackbarService.success("Marked as done");
        })
      )
      .subscribe();
  }

  /** Forces the AI to read this receipt's products again (Phase 3 2d); it runs in the background. */
  public readWithAi(row: Receipt): void {
    this.receiptProductService
      .readReceiptProducts(row.id)
      .pipe(take(1))
      .subscribe(() => this.snackbarService.success("Queued: the AI will read this receipt shortly"));
  }

  public duplicateReceipt(row: Receipt): void {
    const dialogRef = this.matDialog.open(ConfirmationDialogComponent);

    dialogRef.componentInstance.headerText = marker("Duplicate Receipt");
    dialogRef.componentInstance.dialogContent = this.translation.t("Are you sure you would like to duplicate the receipt {name}?", { name: row.name });

    dialogRef
      .afterClosed()
      .pipe(
        take(1),
        tap((confirmed) => {
          if (confirmed) {
            this.receiptService
              .duplicateReceipt(row.id)
              .pipe(
                take(1),
                tap((r: Receipt) => {
                  this.snackbarService.success("Receipt successfully duplicated");
                  this.router.navigateByUrl(`/receipts/${r.id}/view`);
                })
              )
              .subscribe();
          }
        })
      )
      .subscribe();
  }

  public updatePageData(pageEvent: PageEvent): void {
    const newPage = pageEvent.pageIndex + 1;
    this.store.dispatch(new SetPage(newPage));
    this.store.dispatch(new SetPageSize(pageEvent.pageSize));

    this.getFilteredReceipts();
  }

  public showStatusUpdateDialog(): void {
    const ref = this.matDialog.open(
      BulkStatusUpdateComponent,
      DEFAULT_DIALOG_CONFIG
    );

    ref
      .afterClosed()
      .pipe(
        take(1),
        tap(
          (
            commentForm:
              | {
              comment: string;
              status: ReceiptStatus;
            }
              | undefined
          ) => {
            const table = this.table();
            if (table.selection.hasValue() && commentForm) {
              const receiptIds = (
                table.selection.selected as Receipt[]
              ).map((r) => r.id as number);

              const bulkResolve: BulkStatusUpdateCommand = {
                comment: commentForm?.comment ?? "",
                status: commentForm?.status,
                receiptIds: receiptIds,
              };
              this.receiptService
                .bulkReceiptStatusUpdate(bulkResolve)
                .pipe(
                  take(1),
                  tap((receipts) => {
                    let newReceipts = Array.from(this.dataSource().data);
                    receipts.forEach((r) => {
                      const receiptInTable = newReceipts.find(
                        (nr) => r.id === nr.id
                      ) as any as Receipt;
                      if (receiptInTable) {
                        receiptInTable.status = r.status;
                        receiptInTable.resolvedDate = r.resolvedDate;
                      }
                    });
                    this.dataSource.set(new TableDataSource(newReceipts));
                  })
                )
                .subscribe();
            }
          }
        )
      )
      .subscribe();
  }


  public exportSelectedReceipts(): void {
    const receiptIds = this.dataSource().data.map(data => data.id);
    this.receiptExportService.exportReceiptsById(receiptIds);
  }
}

/** "2026-10-20" as the datepicker's local-midnight Date, the form a date filter entry holds. */
function dayKeyToLocalDate(day: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date);
}
