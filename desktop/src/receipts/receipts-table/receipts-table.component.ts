import { TranslationService } from "../../i18n/translation.service";
import { CurrencyPipe, DatePipe, NgTemplateOutlet, NgIf } from "@angular/common";
import { AfterViewInit, Component, computed, HostListener, inject, OnInit, signal, TemplateRef, viewChild, ChangeDetectionStrategy, DestroyRef } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { AppDialog } from "../../dialog/app-dialog";
import { PageEvent, Sort, TableDataSource } from "../../table/table-types";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { isSettled } from "../../utils/receipt-status";
import { appDatePattern } from "../../utils/app-date-format";
import { SystemSettingsStore } from "../../store/system-settings.store";
import { parseDayRange, ResolvedPeriod } from "../../overview/overview-period";
import { catchError, debounceTime, distinctUntilChanged, EMPTY, filter as rxFilter, map, Subject, switchMap, take, tap } from "rxjs";
import { ReceiptFilterService } from "src/services/receipt-filter.service";
import { ConfirmationDialogComponent } from "src/shared-ui/confirmation-dialog/confirmation-dialog.component";
import { DEFAULT_RECEIPT_ORDER_BY, DEFAULT_RECEIPT_SORT_DIRECTION, ReceiptTableStore } from "src/store/receipt-table.store";
import { TableColumn } from "src/table/table-column.interface";
import { TableComponent } from "src/table/table/table.component";
import { DEFAULT_DIALOG_CONFIG, DEFAULT_HOST_CLASS } from "../../constants";
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
import { RowAction, RowActionsComponent } from "../../shared-ui/row-actions/row-actions.component";
import { ViewportService } from "../../services/viewport.service";
import { UserStore, GroupStore, AuthStore } from "../../store";
import { CustomCurrencyPipe } from "../../pipes/custom-currency.pipe";
import {
  applyFormCommand,
  currentColumnKey,
  reconcileColumns,
  RECEIPT_COLUMN_DISPLAY_NAMES,
} from "../../utils/index";
import { buildReceiptFilterForm } from "../../utils/receipt-filter";
import { buildReceiptFilterChips, ReceiptFilterChip } from "../../utils/receipt-filter-chips";
import { isFilterEntryActive } from "../../utils/receipt-filter-entry";
import { QuickScanLauncher } from "../quick-scan-dialog/quick-scan-launcher.service";
import { BulkStatusUpdateComponent } from "../bulk-resolve-dialog/bulk-status-update-dialog.component";
import { ColumnConfigurationDialogComponent } from "../column-configuration-dialog/column-configuration-dialog.component";
import { marker } from "../../i18n/marker";
import { TableHeaderComponent } from "../../shared-ui/table-header/table-header.component";
import { HlmInputGroup } from "../../ui/input-group/lib/hlm-input-group";
import { HlmInputGroupAddon } from "../../ui/input-group/lib/hlm-input-group-addon";
import { AppIconComponent } from "../../shared-ui/icon/icon.component";
import { BrnFieldControl, BrnFieldControlDescribedBy } from "@spartan-ng/brain/field";
import { BrnInput } from "@spartan-ng/brain/input";
import { HlmInput } from "../../ui/input/lib/hlm-input";
import { HlmInputGroupInput } from "../../ui/input-group/lib/hlm-input-group-input";
import { BrnButton } from "@spartan-ng/brain/button";
import { HlmButton } from "../../ui/button/lib/hlm-button";
import { HlmInputGroupButton } from "../../ui/input-group/lib/hlm-input-group-button";
import { AddButtonComponent } from "../../shared-ui/add-button/add-button.component";
import { QueueStartMenuComponent } from "../../shared-ui/queue-start-menu/queue-start-menu.component";
import { CdkMenuTrigger, CdkMenu, CdkMenuItem } from "@angular/cdk/menu";
import { HlmDropdownMenuTrigger } from "../../ui/dropdown-menu/lib/hlm-dropdown-menu-trigger";
import { HlmDropdownMenu } from "../../ui/dropdown-menu/lib/hlm-dropdown-menu";
import { HlmDropdownMenuFocusOnHover } from "../../ui/dropdown-menu/lib/hlm-dropdown-menu-focus-on-hover";
import { HlmDropdownMenuItem } from "../../ui/dropdown-menu/lib/hlm-dropdown-menu-item";
import { PeriodPickerComponent } from "../../overview/period-picker/period-picker.component";
import { HlmBadge } from "../../ui/badge/lib/hlm-badge";
import { ShopMonogramComponent } from "../../shared-ui/shop-monogram/shop-monogram.component";
import { BrnTooltip } from "@spartan-ng/brain/tooltip";
import { HlmTooltip } from "../../ui/tooltip/lib/hlm-tooltip";
import { MoneyComponent } from "../../shared-ui/money/money.component";
import { ReceiptCurrencyNoteComponent } from "../receipt-currency-note/receipt-currency-note.component";
import { StatusChipComponent } from "../../shared-ui/status-chip/status-chip.component";
import { EditButtonComponent } from "../../shared-ui/edit-button/edit-button.component";
import { HasGroupPermissionDirective } from "../../directives/has-group-permission.directive";
import { TranslatePipe } from "../../i18n/translate.pipe";
import { AppDatePipe } from "../../pipes/app-date.pipe";
import { NamePipe } from "../../pipes/name.pipe";
import { UserPipe } from "../../pipes/user.pipe";

@Component({
    selector: "app-receipts-table",
    templateUrl: "./receipts-table.component.html",
    host: DEFAULT_HOST_CLASS,
    // The chip labels are built in TS rather than the template, so the formatting
    // pipes are injected. CustomCurrencyPipe is declared in PipesModule and needs
    // CurrencyPipe, neither of which is providedIn: "root".
    providers: [CurrencyPipe, CustomCurrencyPipe, DatePipe],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [TableHeaderComponent, HlmInputGroup, HlmInputGroupAddon, AppIconComponent, BrnFieldControl, BrnInput, BrnFieldControlDescribedBy, HlmInput, HlmInputGroupInput, BrnButton, HlmButton, HlmInputGroupButton, NgTemplateOutlet, NgIf, AddButtonComponent, QueueStartMenuComponent, CdkMenuTrigger, HlmDropdownMenuTrigger, CdkMenu, HlmDropdownMenu, CdkMenuItem, HlmDropdownMenuFocusOnHover, HlmDropdownMenuItem, PeriodPickerComponent, HlmBadge, TableComponent, RouterLink, ShopMonogramComponent, BrnTooltip, HlmTooltip, MoneyComponent, ReceiptCurrencyNoteComponent, StatusChipComponent, RowActionsComponent, EditButtonComponent, HasGroupPermissionDirective, TranslatePipe, AppDatePipe, NamePipe, UserPipe]
})
export class ReceiptsTableComponent implements OnInit, AfterViewInit {
  private readonly authStore = inject(AuthStore);

  private readonly groupStore = inject(GroupStore);

  private readonly userStore = inject(UserStore);

  private readonly systemSettingsStore = inject(SystemSettingsStore);

  private readonly receiptTableStore = inject(ReceiptTableStore);

  constructor(
    private activatedRoute: ActivatedRoute,
    private groupsService: GroupsService,
    private dialog: AppDialog,
    private receiptExportService: ReceiptExportService,
    private receiptFilterService: ReceiptFilterService,
    private receiptService: ReceiptService,
    private router: Router,
    private snackbarService: SnackbarService,
    private customCurrencyPipe: CustomCurrencyPipe,
    private datePipe: DatePipe,
    private translation: TranslationService
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

  readonly noteCell = viewChild.required<TemplateRef<any>>("noteCell");

  readonly actionsCell = viewChild.required<TemplateRef<any>>("actionsCell");

  readonly table = viewChild.required(TableComponent);

  public page = this.receiptTableStore.page;

  public pageSize = this.receiptTableStore.pageSize;

  public filter = this.receiptTableStore.state;

  /** The phrase applied to the table, as the store holds it. */
  private readonly appliedSearch = this.receiptTableStore.search;

  /** What the search box shows: ahead of the store while the debounce waits. */
  public readonly searchText = signal(this.receiptTableStore.search());

  private readonly searchTyped = new Subject<string>();

  public columnConfig = this.receiptTableStore.columnConfig;

  public selectedGroupId = this.groupStore.selectedGroupId;

  private readonly refreshRequested = new Subject<void>();

  /** Set by the first refresh, which the period picker asks for when it mounts. */
  private refreshWasRequested = false;

  private groups = this.groupStore.groups;

  private users = this.userStore.users;

  private dateFormat = this.systemSettingsStore.dateFormat;

  private receiptFilter = computed(
    () => this.filter()?.filter as ReceiptPagedRequestFilter | undefined
  );

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
        // In the household date format and the app's language, never DatePipe's default en-US.
        formatDate: (value) => {
          const locale = this.translation.locale();
          return this.datePipe.transform(value as string, appDatePattern("mediumDate", this.dateFormat(), locale), undefined, locale) ?? "";
        },
        formatCurrency: (value) => this.customCurrencyPipe.transform(value as number),
        translate: (text) => this.translation.t(text),
      }
    );
  });

  private numFiltersAppliedRaw = this.receiptTableStore.numFiltersApplied;

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

  /** Set after the first answer, so the empty state never shows before the list has loaded. */
  public loaded = signal(false);

  /**
   * The table's empty line: a search or a filter from the dialog says why it is empty, otherwise how to begin. The
   * period alone does not count: it is always set and on show in the period picker.
   */
  public emptyText = computed(() =>
    this.numFiltersApplied() || this.appliedSearch().length > 0
      ? marker("No receipts match the search and filters.")
      : marker("No receipts yet. Scan a receipt or add one by hand.")
  );

  public selectedReceiptIds = signal<number[]>([]);

  public firstSort: boolean = true;

  public canEdit: boolean = false;

  public canCreate: boolean = false;

  public canQuickScan: boolean = false;


  public headerText: string = "";

  public group?: Group;

  protected readonly Permission = Permission;

  /** A range the Dashboard opened this list on (`?from=&to=`, "yyyy-MM-dd"); the period picker starts there. */
  public initialPeriod?: { from: string; to: string };

  public ngOnInit(): void {
    const query = this.activatedRoute.snapshot.queryParamMap;
    this.initialPeriod = parseDayRange(query.get("from"), query.get("to"));
    this.groupId = this.groupStore.selectedGroupId()
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
        : this.authStore.groupCategories(numericGroupId)
    );
    this.tags.set(
      Number.isNaN(numericGroupId)
        ? []
        : this.authStore.groupTags(numericGroupId)
    );

    this.reconcileColumnConfig();
    // No request from here: the period picker hands over its period as soon as it mounts, and that one asks for the
    // page (periodSelected). A request of this page's own was sent and then thrown away on every visit.
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
    const persisted = this.receiptTableStore.columnConfig();
    const reconciled = reconcileColumns(persisted);

    const changed =
      reconciled.length !== persisted.length ||
      reconciled.some(
        (column, index) =>
          column.columnDef !== persisted[index].columnDef ||
          column.visible !== persisted[index].visible ||
          column.order !== persisted[index].order
      );

    if (changed) {
      this.receiptTableStore.setColumnConfig(reconciled);
    }

    const filterData = this.receiptTableStore.state();
    // A sort kept from before a column changed its key follows it (the Note column was first_comment).
    const orderBy = currentColumnKey(filterData.orderBy ?? "");
    const isKnownColumn = reconciled.some(
      (column) => column.columnDef === orderBy
    );

    if (!isKnownColumn) {
      this.receiptTableStore.setFilterData({
        ...filterData,
        orderBy: DEFAULT_RECEIPT_ORDER_BY,
        sortDirection: DEFAULT_RECEIPT_SORT_DIRECTION,
      });
    } else if (orderBy !== filterData.orderBy) {
      this.receiptTableStore.setFilterData({ ...filterData, orderBy });
    }
  }

  private setGroup(): void {
    this.group = this.groupStore.getGroupById(this.groupId);
  }

  private setCanEdit(): void {
    const groupId = Number.parseInt(this.groupId);
    this.canEdit = this.authStore.hasGroupPermission(groupId, Permission.GroupReceiptsUpdate);
    this.canCreate = this.authStore.hasGroupPermission(groupId, Permission.GroupReceiptsCreate);
    this.canQuickScan = this.authStore.hasGroupPermission(groupId, Permission.GroupReceiptsQuickScan);
  }

  private setHeaderText(): void {
    const group = this.groupStore.getGroupById(this.groupId);
    // Translatable titles (the header passes them through `t`): "<group> Receipts" could never be translated.
    if (group) {
      this.headerText = group.isAllGroup ? marker("All receipts") : marker("Receipts");
    }
  }

  public ngAfterViewInit(): void {
    // The cell templates exist from here on.
    this.setColumns();
    this.setSelectedReceiptIdsObservable();
  }

  private setSelectedReceiptIdsObservable(): void {
    this.table()?.selection?.changed
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        map((event) => (event.source.selected as Receipt[]).map((r) => r.id)),
        tap((ids) => this.selectedReceiptIds.set(ids))
      )
      .subscribe();
  }

  private setColumns(): void {
    const currentColumnConfig = this.receiptTableStore.columnConfig();

    // On a phone each receipt is a card: the shop and its date on the left, the amount and status on the right, and
    // whatever else the person switched on as labelled details below (`phone`, see app-table).
    const allColumns = [
      {
        columnHeader: "Receipt Date",
        columnDef: "date",
        phone: "subtitle",
        template: this.dateCell(),
        sortable: true,
      },
      {
        // The clickable Shop: the shop printed on the receipt (Auchan, Edeka, Rewe), read by the AI, or
        // the receipt's name when none was read. It sorts the same way (shop_name on the API).
        columnHeader: RECEIPT_COLUMN_DISPLAY_NAMES["shop_name"],
        columnDef: "shop_name",
        phone: "title",
        template: this.shopCell(),
        sortable: true,
      },
      {
        // Who added the receipt (the paid by user, which a family does not distinguish).
        columnHeader: RECEIPT_COLUMN_DISPLAY_NAMES["paid_by_user_id"],
        columnDef: "paid_by_user_id",
        template: this.addedByCell(),
        sortable: true,
      },
      {
        columnHeader: "Amount",
        columnDef: "amount",
        phone: "aside",
        template: this.amountCell(),
        sortable: true,
      },
      {
        columnHeader: "Categories",
        columnDef: "categories",
        template: this.categoryCell(),
        sortable: false,
      },
      {
        columnHeader: "Tags",
        columnDef: "tags",
        template: this.tagCell(),
        sortable: false,
      },
      {
        columnHeader: "Status",
        columnDef: "status",
        phone: "aside",
        template: this.statusCell(),
        sortable: true,
      },
      {
        columnHeader: "Settled on",
        columnDef: "resolved_date",
        template: this.resolvedDateCell(),
        sortable: true,
      },
      {
        // The receipt's note, which the API returns and sorts on under this same key.
        columnHeader: RECEIPT_COLUMN_DISPLAY_NAMES["note"],
        columnDef: "note",
        template: this.noteCell(),
        sortable: true,
      },
    ] as TableColumn[];


    // Filter and order columns based on configuration
    // A household that hides the note hides its column too, whatever the saved layout says.
    const noteHidden = !!this.group?.groupReceiptSettings?.hideNote;
    const visibleColumnConfigs = currentColumnConfig
      .filter(config => config.visible && !(noteHidden && config.columnDef === "note"))
      .sort((a, b) => a.order - b.order);

    const columns = visibleColumnConfigs
      .map(config => allColumns.find(col => col.columnDef === config.columnDef))
      .filter(col => col !== undefined) as TableColumn[];

    if (this.canEdit) {
      columns.push({
        columnHeader: marker("Actions"),
        columnDef: "actions",
        template: this.actionsCell(),
        sortable: false,
      });
    }

    // Derived from the columns that actually resolved, never from the stored
    // configuration: mat-table throws on a displayed id it has no definition for,
    // and a configuration naming a since-removed column is ordinary.
    const displayColumns = ["select", ...columns.map(col => col.columnDef)];

    const filter = this.receiptTableStore.state();
    const orderByIndex = columns.findIndex(
      (c) => c.columnDef === filter.orderBy
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
      const filterData = this.receiptTableStore.state();

      this.receiptTableStore.setFilterData({
        page: filterData.page,
        pageSize: filterData.pageSize,
        orderBy: sortState.active,
        sortDirection: sortState.direction,
        filter: filterData.filter,
      });

      this.getFilteredReceipts();
    }
    this.firstSort = false;
  }

  public filterButtonClicked(): void {
    const filter = this.receiptTableStore.state().filter as any;

    const dialogRef = this.dialog.open(ReceiptFilterComponent, {
      minWidth: "75%",
      maxWidth: "100%",
    });

    dialogRef.componentInstance.categories = this.categories();
    dialogRef.componentInstance.tags = this.tags();
    dialogRef.componentInstance.parentForm = buildReceiptFilterForm(filter, this.destroyRef);
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
            this.receiptTableStore.setPage(1);
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
      // The picker's first word loads the page whatever it says: with no usable range, the stored filter as it is.
      if (!this.refreshWasRequested) {
        this.getFilteredReceipts();
      }
      return;
    }

    this.applyFilterField("date", {
      operation: FilterOperation.Between,
      value: [dayKeyToLocalDate(period.from), dayKeyToLocalDate(period.to)],
    } as any);
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
    this.receiptTableStore.setFilterField(field, entry);
    this.receiptTableStore.setPage(1);
    this.getFilteredReceipts();
  }

  private readonly quickScanLauncher = inject(QuickScanLauncher);
  private readonly destroyRef = inject(DestroyRef);

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
    this.receiptTableStore.resetFilter();
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
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((value) => this.applySearch(value));
  }

  private applySearch(value: string): void {
    this.receiptTableStore.setSearch(value);
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
    const currentColumnConfig = this.receiptTableStore.columnConfig();

    const dialogRef = this.dialog.open(ColumnConfigurationDialogComponent, {
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
            this.receiptTableStore.setColumnConfig(result);
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
    this.refreshWasRequested = true;
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
        takeUntilDestroyed(this.destroyRef),
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
          this.loaded.set(true);
        })
      )
      .subscribe();
  }

  public deleteReceipt(row: Receipt): void {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent);

    dialogRef.componentInstance.headerText = marker("Delete Receipt");
    dialogRef.componentInstance.confirmText = marker("Delete");
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

  /** A phone shows each receipt as a card (app-table) with its actions in one menu. */
  public readonly isHandset = inject(ViewportService).isHandset;

  /** The row's actions as the phone's menu lists them: the same ones, behind the same permissions, as the buttons. */
  public readonly rowActions: readonly RowAction<Receipt>[] = [
    { key: "edit", label: marker("Edit"), icon: "edit", testId: "receipt-edit" },
    {
      key: "done",
      label: marker("Mark as settled"),
      icon: "check",
      testId: "receipt-mark-done",
      visible: (row) => !this.isDone(row) && this.mayOnRow(row, Permission.GroupReceiptsUpdate),
    },
    {
      key: "read",
      label: marker("Read with AI"),
      icon: "auto_awesome",
      testId: "receipt-read-with-ai",
      visible: (row) => this.mayOnRow(row, Permission.GroupReceiptsUpdate),
    },
    {
      key: "duplicate",
      label: marker("Duplicate"),
      icon: "file_copy",
      testId: "receipt-duplicate",
      visible: (row) => this.mayOnRow(row, Permission.GroupReceiptsDuplicate),
    },
    {
      key: "delete",
      label: marker("Delete"),
      icon: "delete",
      testId: "receipt-delete",
      destructive: true,
      visible: (row) => this.mayOnRow(row, Permission.GroupReceiptsDelete),
    },
  ];

  /** Gated on the receipt's own household, never the page's (the "All" view lists several). */
  private mayOnRow(row: Receipt, permission: Permission): boolean {
    return this.authStore.hasGroupPermission(row.groupId, permission);
  }

  public runRowAction(key: string, row: Receipt): void {
    switch (key) {
      case "edit":
        void this.router.navigate(["/receipts", row.id, "edit"]);
        break;
      case "done":
        this.markDone(row);
        break;
      case "read":
        this.readWithAi(row);
        break;
      case "duplicate":
        this.duplicateReceipt(row);
        break;
      case "delete":
        this.deleteReceipt(row);
        break;
    }
  }

  /** A receipt that reads as "Done" needs no check mark (Phase 3 2e). */
  public isDone(row: Receipt): boolean {
    return isSettled(row.status);
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
          this.snackbarService.success("Marked as settled");
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
    const dialogRef = this.dialog.open(ConfirmationDialogComponent);

    dialogRef.componentInstance.headerText = marker("Duplicate Receipt");
    dialogRef.componentInstance.dialogContent = this.translation.t("Are you sure you would like to duplicate the receipt {name}?", { name: row.name });
    dialogRef.componentInstance.confirmText = marker("Duplicate");

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
    this.receiptTableStore.setPage(newPage);
    this.receiptTableStore.setPageSize(pageEvent.pageSize);

    this.getFilteredReceipts();
  }

  public showStatusUpdateDialog(): void {
    const ref = this.dialog.open(
      BulkStatusUpdateComponent,
      DEFAULT_DIALOG_CONFIG
    );

    ref
      .afterClosed()
      .pipe(
        take(1),
        tap(
          (picked: { status: ReceiptStatus } | undefined) => {
            const table = this.table();
            if (table.selection.hasValue() && picked) {
              const receiptIds = (
                table.selection.selected as Receipt[]
              ).map((r) => r.id as number);

              const bulkResolve: BulkStatusUpdateCommand = {
                status: picked.status,
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
