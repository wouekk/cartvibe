import { provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { NgxsModule, Store } from "@ngxs/store";
import { ApiModule, FilterOperation, ReceiptService } from "../open-api";
import { buildDefaultReceiptFilter, ReceiptTableState } from "../store/receipt-table.state";
import { SetReceiptFilterData } from "../store/receipt-table.actions";
import { ReceiptFilterService } from "./receipt-filter.service";
import { provideHttpClient, withInterceptorsFromDi } from "@angular/common/http";

describe("ReceiptFilterService", () => {
  let service: ReceiptFilterService;
  let store: Store;
  let receiptService: ReceiptService;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [ApiModule, NgxsModule.forRoot([ReceiptTableState])],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(ReceiptFilterService);
    store = TestBed.inject(Store);
    receiptService = TestBed.inject(ReceiptService);
  });

  it("should be created", () => {
    expect(service).toBeTruthy();
  });

  it("sends the search phrase with the table request", () => {
    const filter = buildDefaultReceiptFilter();
    filter.search = "choc noir";
    store.dispatch(new SetReceiptFilterData({ page: 1, pageSize: 25, orderBy: "date", sortDirection: "desc", filter } as any));

    expect((service.buildPagedRequestCommand() as any).filter.search).toBe("choc noir");

  });

  // Date filters go out as the calendar day picked; the server resolves the day
  // in the right zone. Converted on the request only - the persisted filter
  // keeps the datepickers' Dates.
  describe("date filter values on the wire", () => {
    function seedMonthFilter(): void {
      const filter = buildDefaultReceiptFilter();
      filter.createdAt = {
        operation: FilterOperation.Between,
        value: [new Date(2026, 8, 1), new Date(2026, 8, 30, 23, 59, 59)],
      } as any;
      filter.date = { operation: FilterOperation.Equals, value: new Date(2026, 8, 15) } as any;

      store.dispatch(
        new SetReceiptFilterData({ page: 1, pageSize: 25, orderBy: "date", sortDirection: "desc", filter } as any)
      );
    }

    it("sends date values as yyyy-MM-dd on the table request", () => {
      seedMonthFilter();

      const command = service.buildPagedRequestCommand() as any;

      expect(command.filter.createdAt.value).toEqual(["2026-09-01", "2026-09-30"]);
      expect(command.filter.date.value).toBe("2026-09-15");
      expect((store.selectSnapshot(ReceiptTableState.filterData).filter as any).createdAt.value[0]).toEqual(
        new Date(2026, 8, 1)
      );
    });

    it("converts a widget's own filter too", () => {
      const command = service.buildPagedRequestCommand(undefined, undefined, undefined, undefined, {
        page: 1,
        pageSize: 10,
        filter: { resolvedDate: { operation: FilterOperation.GreaterThan, value: "2026-09-15" } },
      } as any) as any;

      expect(command.filter.resolvedDate.value).toBe("2026-09-15");
    });
  });
});
