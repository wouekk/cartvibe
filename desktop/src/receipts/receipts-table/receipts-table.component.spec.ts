import { provideHttpClientTesting } from "@angular/common/http/testing";
import { CUSTOM_ELEMENTS_SCHEMA, provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ReactiveFormsModule } from "@angular/forms";
import { AppDialog } from "../../dialog/app-dialog";
import { HlmTooltipImports } from "@spartan-ng/helm/tooltip";
import { ActivatedRoute, provideRouter, Router } from "@angular/router";
import { NgxsModule, Store } from "@ngxs/store";
import { of, Subject, throwError } from "rxjs";
import { DEFAULT_RECEIPT_TABLE_COLUMNS } from "src/interfaces";
import { ReceiptTableStore } from "src/store/receipt-table.store";
import { ConfirmationDialogComponent } from "../../shared-ui/confirmation-dialog/confirmation-dialog.component";
import { ApiModule, FilterOperation, Group, Permission, Receipt, ReceiptService, ReceiptStatus } from "../../open-api";
import { ReceiptFilterService } from "../../services/receipt-filter.service";
import { AuthState, GroupState, UserState } from "../../store";
import { SetPermissions } from "../../store/auth.state.actions";
import { SetGroups } from "../../store/group.state.actions";
import { ReceiptsTableComponent } from "./receipts-table.component";
import { provideHttpClient, withInterceptorsFromDi } from "@angular/common/http";


import type { MockInstance } from "vitest";
describe("ReceiptsTableComponent", () => {
  let component: ReceiptsTableComponent;
  let fixture: ComponentFixture<ReceiptsTableComponent>;
  let store: Store;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    imports: [ApiModule,
        NgxsModule.forRoot([AuthState, GroupState, UserState]),
        ReactiveFormsModule,
        ...HlmTooltipImports,
        ReceiptsTableComponent],
    providers: [
        {
            provide: ActivatedRoute,
            useValue: {
                snapshot: {
                    data: {
                        categories: [],
                        tags: [],
                    },
                },
            },
        },
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        provideZonelessChangeDetection(),
        provideRouter([]),
    ]
}).compileComponents();

    store = TestBed.inject(Store);
    fixture = TestBed.createComponent(ReceiptsTableComponent);
    component = fixture.componentInstance;
    Object.defineProperty(component, 'table', {
      value: () => ({
        selection: {},
        changed: of(undefined),
      }),
    });
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("gates each header action on its own group permission", () => {
    store.dispatch(
      new SetPermissions([], {
        5: [
          Permission.GroupReceiptsCreate,
          Permission.GroupReceiptsQuickScan,
        ],
      })
    );
    component.groupId = "5";

    (component as any).setCanEdit();

    expect(component.canCreate).toEqual(true);
    expect(component.canQuickScan).toEqual(true);
    // None of those imply update, which gates Edit / Bulk Status Update.
    expect(component.canEdit).toEqual(false);
  });

  it("keeps canEdit tied to group.receipts.update only", () => {
    store.dispatch(
      new SetPermissions([], { 5: [Permission.GroupReceiptsUpdate] })
    );
    component.groupId = "5";

    (component as any).setCanEdit();

    expect(component.canEdit).toEqual(true);
    expect(component.canCreate).toEqual(false);
    expect(component.canQuickScan).toEqual(false);
  });

  describe("the phone's row menu", () => {
    const shown = (row: Partial<Receipt>): string[] =>
      component.rowActions.filter((action) => !action.visible || action.visible(row as Receipt)).map((action) => action.key);

    it("lists the same actions as the row's buttons, each behind the receipt's own household's permission", () => {
      store.dispatch(
        new SetPermissions([], {
          5: [Permission.GroupReceiptsUpdate, Permission.GroupReceiptsDuplicate, Permission.GroupReceiptsDelete],
          6: [Permission.GroupReceiptsDuplicate],
        })
      );

      expect(shown({ id: 1, groupId: 5, status: ReceiptStatus.Open })).toEqual(["edit", "done", "read", "duplicate", "delete"]);
      // A settled receipt needs no check mark.
      expect(shown({ id: 2, groupId: 5, status: ReceiptStatus.Resolved })).toEqual(["edit", "read", "duplicate", "delete"]);
      // Another household in the "All" view: only what the person may do there.
      expect(shown({ id: 3, groupId: 6, status: ReceiptStatus.Open })).toEqual(["edit", "duplicate"]);
      expect(component.rowActions.find((action) => action.key === "delete")?.destructive).toBe(true);
    });

    it("runs the action that was picked", () => {
      const row = { id: 9, groupId: 5, status: ReceiptStatus.Open } as Receipt;
      const markDone = vi.spyOn(component, "markDone").mockImplementation(() => undefined);
      const readWithAi = vi.spyOn(component, "readWithAi").mockImplementation(() => undefined);
      const duplicate = vi.spyOn(component, "duplicateReceipt").mockImplementation(() => undefined);
      const remove = vi.spyOn(component, "deleteReceipt").mockImplementation(() => undefined);
      const navigate = vi.spyOn(TestBed.inject(Router), "navigate").mockResolvedValue(true);

      for (const key of ["edit", "done", "read", "duplicate", "delete"]) {
        component.runRowAction(key, row);
      }

      expect(navigate).toHaveBeenCalledWith(["/receipts", 9, "edit"]);
      expect(markDone).toHaveBeenCalledWith(row);
      expect(readWithAi).toHaveBeenCalledWith(row);
      expect(duplicate).toHaveBeenCalledWith(row);
      expect(remove).toHaveBeenCalledWith(row);
    });
  });

  describe("columns", () => {

    // setColumns reads the cell templates through viewChild.required, which never
    // resolves for a component this spec never renders.
    const stubCellTemplates = (): void => {
      for (const cell of [
        "createdAtCell", "dateCell", "nameCell", "amountCell",
        "categoryCell", "tagCell", "statusCell", "resolvedDateCell",
        "noteCell", "actionsCell",
      ]) {
        Object.defineProperty(component, cell, { value: () => ({}) });
      }
    };

    beforeEach(() => {
      stubCellTemplates();
    });


    const withNoteShown = () =>
      DEFAULT_RECEIPT_TABLE_COLUMNS.map((column) =>
        column.columnDef === "note" ? { ...column, visible: true } : column
      );

    it("offers a sortable Note column, hidden until it is switched on", () => {
      TestBed.inject(ReceiptTableStore).setColumnConfig(DEFAULT_RECEIPT_TABLE_COLUMNS);

      (component as any).setColumns();

      expect(component.displayedColumns()).not.toContain("note");

      TestBed.inject(ReceiptTableStore).setColumnConfig(withNoteShown());

      (component as any).setColumns();

      // Its columnDef is also the orderBy the API sorts on, so both must be
      // exactly note.
      const column = component
        .columns()
        .find((col) => col.columnDef === "note");
      expect(column?.columnHeader).toEqual("Note");
      expect(column?.sortable).toEqual(true);
      expect(component.displayedColumns()).toContain("note");
    });

    it("leaves the Note column out for a household that hides the note, whatever the saved layout says", () => {
      TestBed.inject(ReceiptTableStore).setColumnConfig(withNoteShown());
      component.group = { id: 1, groupReceiptSettings: { hideNote: true } } as any;

      (component as any).setColumns();

      expect(component.displayedColumns()).not.toContain("note");
      expect(component.columns().some((col) => col.columnDef === "note")).toBe(false);
      // The layout itself is kept: the column is back when the household shows the note again.
      expect(TestBed.inject(ReceiptTableStore).columnConfig().find((col) => col.columnDef === "note")?.visible).toBe(true);
    });

    // mat-table throws on a displayed id it has no definition for, and a config
    // naming a since-removed column is ordinary rather than exotic.
    it("never displays a column it could not resolve", () => {
      TestBed.inject(ReceiptTableStore).setColumnConfig([
          ...DEFAULT_RECEIPT_TABLE_COLUMNS,
          { columnDef: "custom_99", visible: true, order: 9 },
        ]);

      (component as any).setColumns();

      expect(component.displayedColumns()).not.toContain("custom_99");
      for (const displayed of component.displayedColumns()) {
        if (displayed === "select") {
          continue;
        }
        expect(
          component.columns().some((col) => col.columnDef === displayed)
        ).toEqual(true);
      }
    });
  });

  describe("reconcileColumnConfig", () => {
    it("drops a persisted column that no longer exists", () => {
      TestBed.inject(ReceiptTableStore).setColumnConfig([
          ...DEFAULT_RECEIPT_TABLE_COLUMNS,
          { columnDef: "custom_99", visible: true, order: 9 },
        ]);

      (component as any).reconcileColumnConfig();

      expect(
        TestBed.inject(ReceiptTableStore).columnConfig()
          .map((col) => col.columnDef)
      ).not.toContain("custom_99");
    });


    // The sort is persisted per browser and shared across accounts, so the table
    // can start up asking the API to order by a column that no longer exists -
    // which the API rejects outright, failing the very first load.
    it("resets a sort on a column that no longer exists", () => {
      const filterData = TestBed.inject(ReceiptTableStore).state();
      TestBed.inject(ReceiptTableStore).setFilterData({ ...filterData, orderBy: "custom_99", sortDirection: "asc" });

      (component as any).reconcileColumnConfig();

      expect(TestBed.inject(ReceiptTableStore).state().orderBy).toEqual(
        "date"
      );
    });

    // A browser that sorted by the Comment column, or showed it, keeps both under the column's new key:
    // the API still reads the old sort key, but the table would not find the column to mark as sorted.
    it("carries a sort and a layout on the Comment column over to the Note column", () => {
      const filterData = TestBed.inject(ReceiptTableStore).state();
      TestBed.inject(ReceiptTableStore).setFilterData({ ...filterData, orderBy: "first_comment", sortDirection: "asc" });
      TestBed.inject(ReceiptTableStore).setColumnConfig(DEFAULT_RECEIPT_TABLE_COLUMNS.map((column) =>
            column.columnDef === "note" ? { ...column, columnDef: "first_comment", visible: true } : column
          ));

      (component as any).reconcileColumnConfig();

      const sorted = TestBed.inject(ReceiptTableStore).state();
      expect(sorted.orderBy).toEqual("note");
      expect(sorted.sortDirection).toEqual("asc");
      const layout = TestBed.inject(ReceiptTableStore).columnConfig();
      expect(layout.some((col) => col.columnDef === "first_comment")).toBe(false);
      expect(layout.find((col) => col.columnDef === "note")?.visible).toBe(true);
    });

    it("keeps a sort on a column that still exists", () => {
      const filterData = TestBed.inject(ReceiptTableStore).state();
      TestBed.inject(ReceiptTableStore).setFilterData({ ...filterData, orderBy: "amount", sortDirection: "asc" });

      (component as any).reconcileColumnConfig();

      expect(TestBed.inject(ReceiptTableStore).state().orderBy).toEqual("amount");
    });
  });

  it("should map selected ids from selecton", () => {
    const selectedReceipts: Receipt[] = [
      {
        id: 1,
      } as Receipt,
      {
        id: 2,
      } as Receipt,
    ];
    Object.defineProperty(component, 'table', {
      value: () => ({
        selection: {
          changed: of({
            source: {
              selected: selectedReceipts,
            },
          }),
        },
      }),
    });
    component.ngAfterViewInit();

    expect(component.selectedReceiptIds()).toEqual([1, 2]);
  });
  describe("quick date filtering and filter chips", () => {
    let refetch: MockInstance;

    const setFilter = (filter: Record<string, unknown>) =>
      TestBed.inject(ReceiptTableStore).setFilter(filter as any);

    beforeEach(() => {
      refetch = vi
        .spyOn(TestBed.inject(ReceiptFilterService), "getPagedReceiptsForGroups")
        .mockReturnValue(of({ data: [], totalCount: 0 } as any));
    });

    it("does not count the date range the period picker already shows in the Filter badge", () => {
      setFilter({ date: { operation: FilterOperation.Between, value: [new Date(2026, 8, 1), new Date(2026, 8, 30)] } });

      expect(component.numFiltersApplied()).toBeUndefined();
      expect(component.anyFilterApplied()).toBe(true);

      setFilter({
        date: { operation: FilterOperation.Between, value: [new Date(2026, 8, 1), new Date(2026, 8, 30)] },
        status: { operation: FilterOperation.Contains, value: [ReceiptStatus.Open] },
        createdAt: { operation: FilterOperation.WithinCurrentMonth, value: null },
      });

      expect(component.numFiltersApplied()).toBe(2);
    });

    // A date filter the period picker did not set stays visible as a chip so it can still be cleared.
    it("shows a date chip for a date filter the period picker did not set", () => {
      setFilter({ date: { operation: FilterOperation.WithinCurrentMonth, value: null } });

      expect(component.filterChips()).toEqual([
        { key: "date", label: "Receipt Date: within current month" },
      ]);
    });

    it("builds a chip per active field, resolving ids to names", () => {
      component.categories.set([{ id: 3, name: "Groceries" }] as any);
      setFilter({
        name: { operation: FilterOperation.Contains, value: "whole" },
        categories: { operation: FilterOperation.Contains, value: [3] },
        status: { operation: FilterOperation.Contains, value: [ReceiptStatus.Open] },
      });

      expect(component.filterChips()).toEqual([
        { key: "name", label: "Name: contains whole" },
        { key: "categories", label: "Categories: contains Groceries" },
        { key: "status", label: "Status: contains To check" },
      ]);
    });

    // Each refresh used to be its own subscription, so the last RESPONSE won
    // rather than the last REQUEST, and the period picker can change twice in quick succession.
    it("lets a newer refresh supersede an in-flight one", () => {
      const superseded = new Subject<any>();
      const latest = new Subject<any>();
      refetch.mockReturnValueOnce(superseded).mockReturnValueOnce(latest);

      component.periodSelected({ from: "2026-09-01", to: "2026-09-30", label: "" });
      component.periodSelected({ from: "2026-10-01", to: "2026-10-31", label: "" });

      // The first request resolving late must not repaint the table.
      superseded.next({ data: [{ id: 1 }], totalCount: 1 });
      expect(component.totalCount()).toEqual(0);

      latest.next({ data: [{ id: 2 }], totalCount: 2 });
      expect(component.totalCount()).toEqual(2);
    });

    // The period picker hands over its period as soon as it mounts, and that is the page's one first request.
    it("asks for the first page once, when the period picker hands over its period", () => {
      refetch.mockReturnValue(of({ data: [{ id: 1 }, { id: 2 }], totalCount: 2 } as any));
      component.groupId = "1";

      component.periodSelected({ from: "2026-10-01", to: "2026-10-31", label: "" });

      expect(refetch).toHaveBeenCalledTimes(1);
      expect(component.totalCount()).toEqual(2);
      expect(component.loaded()).toBe(true);
    });

    it("loads the stored filter when the picker's first range is unusable, and leaves later ones alone", () => {
      refetch.mockReturnValue(of({ data: [{ id: 1 }], totalCount: 1 } as any));
      component.groupId = "1";

      component.periodSelected(undefined);

      expect(refetch).toHaveBeenCalledTimes(1);
      expect(component.totalCount()).toEqual(1);

      component.periodSelected(undefined);

      expect(refetch).toHaveBeenCalledTimes(1);
    });

    // switchMap completes the outer stream on an error unless the inner one
    // swallows it, which would silently kill every refresh after the first
    // failure.
    it("keeps refreshing after a failed request", () => {
      refetch.mockReturnValueOnce(throwError(() => new Error("boom")));

      component.periodSelected({ from: "2026-09-01", to: "2026-09-30", label: "" });

      refetch.mockReturnValue(of({ data: [{ id: 3 }], totalCount: 3 }));
      component.periodSelected({ from: "2026-10-01", to: "2026-10-31", label: "" });

      expect(component.totalCount()).toEqual(3);
    });

    it("clears exactly the field whose chip was dismissed", () => {
      setFilter({
        name: { operation: FilterOperation.Contains, value: "whole" },
        status: { operation: FilterOperation.Contains, value: [ReceiptStatus.Open] },
      });

      component.filterChipCleared("status");

      const filter = TestBed.inject(ReceiptTableStore).state().filter as any;
      expect(filter.status).toEqual({ operation: null, value: [] });
      expect(filter.name).toEqual({ operation: FilterOperation.Contains, value: "whole" });
      expect(component.filterChips().map((chip) => chip.key)).toEqual(["name"]);
      expect(TestBed.inject(ReceiptTableStore).page()).toEqual(1);
      expect(refetch).toHaveBeenCalled();
    });
  });
  // Duplicating a receipt creates a real record and navigates away from the
  // list, so a mis-click is easy to miss — the row action confirms first.
  describe("toolbar search", () => {
    let refetch: MockInstance;

    beforeEach(() => {
      vi.useFakeTimers();
      refetch = vi
        .spyOn(TestBed.inject(ReceiptFilterService), "getPagedReceiptsForGroups")
        .mockReturnValue(of({ data: [], totalCount: 0 } as any));
    });

    afterEach(() => vi.useRealTimers());

    const storedSearch = () => TestBed.inject(ReceiptTableStore).search();

    it("waits for a pause in typing, then applies the trimmed phrase once", () => {
      component.searchInput("c");
      component.searchInput("choc");
      component.searchInput("choc ");
      vi.advanceTimersByTime(299);
      expect(storedSearch()).toBe("");

      vi.advanceTimersByTime(1);

      expect(storedSearch()).toBe("choc");
      expect(refetch).toHaveBeenCalledTimes(1);
      expect(component.searchText()).toBe("choc ");
    });

    it("does not ask again for a phrase that is already applied", () => {
      component.searchInput("milk");
      vi.advanceTimersByTime(300);
      refetch.mockClear();

      component.searchInput("milk");
      vi.advanceTimersByTime(300);

      expect(refetch).not.toHaveBeenCalled();
    });

    it("clears at once, without the debounce", () => {
      component.searchInput("milk");
      vi.advanceTimersByTime(300);
      refetch.mockClear();

      component.clearSearch();

      expect(component.searchText()).toBe("");
      expect(storedSearch()).toBe("");
      expect(refetch).toHaveBeenCalledTimes(1);
    });

    it("offers Reset for a search alone, and reset empties the box", () => {
      expect(component.anyFilterApplied()).toBe(false);
      component.searchInput("milk");
      vi.advanceTimersByTime(300);
      expect(component.anyFilterApplied()).toBe(true);

      component.resetFilterButtonClicked();

      expect(component.searchText()).toBe("");
      expect(storedSearch()).toBe("");
    });

    it("lists the matched product lines with their prices", () => {
      vi.spyOn((component as any).customCurrencyPipe, "transform").mockImplementation((value: any) => "€" + value);
      const text = component.searchMatchesText({
        searchMatches: [{ name: "Dark chocolate", amount: "2.49" }, { name: "Chocolate milk" }],
      });

      expect(text).toBe("Dark chocolate · €2.49, Chocolate milk");
      expect(component.searchMatchesText({})).toBe("");
    });
  });

  describe("duplicate confirmation", () => {
    const row = { id: 4, name: "Lunch" } as Receipt;

    let receiptService: ReceiptService;
    let router: Router;

    const stubDialog = (confirmed: boolean | undefined) =>
      vi.spyOn(TestBed.inject(AppDialog), "open").mockReturnValue({
        componentInstance: {},
        afterClosed: () => of(confirmed),
      } as any);

    beforeEach(() => {
      receiptService = TestBed.inject(ReceiptService);
      router = TestBed.inject(Router);
      vi
        .spyOn(receiptService, "duplicateReceipt")
        .mockReturnValue(of({ id: 9 } as Receipt) as any);
      vi.spyOn(router, "navigateByUrl").mockResolvedValue(true);
    });

    it("duplicates and navigates to the copy once confirmed", () => {
      const open = stubDialog(true);

      component.duplicateReceipt(row);

      expect(open).toHaveBeenCalledWith(ConfirmationDialogComponent);
      expect(receiptService.duplicateReceipt).toHaveBeenCalledWith(4);
      expect(router.navigateByUrl).toHaveBeenCalledWith("/receipts/9/view");
    });

    it("does nothing when the dialog is cancelled", () => {
      stubDialog(false);

      component.duplicateReceipt(row);

      expect(receiptService.duplicateReceipt).not.toHaveBeenCalled();
      expect(router.navigateByUrl).not.toHaveBeenCalled();
    });

    // A backdrop click / ESC closes with undefined rather than false.
    it("does nothing when the dialog is dismissed", () => {
      stubDialog(undefined);

      component.duplicateReceipt(row);

      expect(receiptService.duplicateReceipt).not.toHaveBeenCalled();
    });
  });
});

/**
 * The summary rides its OWN refresh stream, and the point of that stream is what it does not do:
 * paging and sorting change neither the filter nor the figures, so re-requesting an unpaged
 * aggregate for them would be the most expensive no-op in the app.
 */
