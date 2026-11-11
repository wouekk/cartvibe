import { TestBed } from "@angular/core/testing";
import { DEFAULT_RECEIPT_TABLE_COLUMNS, ReceiptTableInterface } from "src/interfaces";
import { FilterOperation, ReceiptPagedRequestFilter, ReceiptStatus } from "../open-api";
import { seedStore } from "../testing/seed-store";
import { buildDefaultReceiptFilter, defaultReceiptFilter, ReceiptTableStore } from "./receipt-table.store";

describe("ReceiptTableStore", () => {
  let table: ReceiptTableStore;
  let filledFilter: ReceiptPagedRequestFilter;

  beforeEach(() => {
    table = TestBed.inject(ReceiptTableStore);

    filledFilter = {
      date: {
        operation: FilterOperation.Equals,
        value: "2023-01-06",
      },
      name: {
        operation: FilterOperation.Equals,
        value: "hello world",
      },
      amount: {
        operation: FilterOperation.GreaterThan,
        value: 12.05,
      },
      paidBy: {
        operation: FilterOperation.Contains,
        value: [1],
      },
      categories: {
        operation: FilterOperation.Contains,
        value: [2],
      },
      tags: {
        operation: FilterOperation.Contains,
        value: [3, 4],
      },
      status: {
        operation: FilterOperation.Contains,
        value: [ReceiptStatus.Open],
      },
      resolvedDate: {
        operation: FilterOperation.GreaterThan,
        value: "2023-01-06",
      },
    } as any;
  });

  it("should return page number", () => {
    const result = table.page();

    expect(result).toEqual(1);
  });

  it("should return pageSize", () => {
    const result = table.pageSize();

    expect(result).toEqual(50);
  });

  it("should return the full state", () => {
    const result = table.state();

    expect(result).toEqual({
      page: 1,
      pageSize: 50,
      orderBy: "date",
      sortDirection: "desc",
      filter: defaultReceiptFilter,
      quickDateField: "date",
      columnConfig: DEFAULT_RECEIPT_TABLE_COLUMNS,
    });
  });

  it("should return 0 since no filters are applied", () => {
    const result = table.numFiltersApplied();

    expect(result).toEqual(0);
  });

  it("should return 8 since all filters are applied", () => {
    seedStore(table, {
      filter: filledFilter,
    });
    const result = table.numFiltersApplied();

    expect(result).toEqual(8);
  });

  it("should return 8 since all filters are applied, with date set as within current month", () => {
    (filledFilter.date as any).operation = FilterOperation.WithinCurrentMonth;
    (filledFilter.date as any).value = undefined;

    seedStore(table, {
      filter: filledFilter,
    });
    const result = table.numFiltersApplied();

    expect(result).toEqual(8);
  });

  it("should set page", () => {
    table.setPage(40);

    const result = table.page();
    expect(result).toEqual(40);
  });

  it("should set page size", () => {
    table.setPageSize(100);

    const result = table.pageSize();
    expect(result).toEqual(100);
  });

  it("should set filter data", () => {
    const filterData: ReceiptTableInterface = {
      page: 20,
      pageSize: 40,
      orderBy: "amount",
      sortDirection: "asc",
      filter: {} as any,
    };
    table.setFilterData(filterData);

    // The payload omits columnConfig and quickDateField, and only the keys it
    // names are written — so sorting cannot reset either.
    const result = table.state();
    expect(result).toEqual({
      ...filterData,
      quickDateField: "date",
      columnConfig: DEFAULT_RECEIPT_TABLE_COLUMNS,
    });
  });

  it("should set filter receipt filter", () => {
    table.setFilter(filledFilter);

    const result = table.state();
    expect(result.filter).toEqual(filledFilter);
  });

  describe("toolbar search", () => {
    it("stores the phrase on the filter and returns to page 1", () => {
      table.setPage(4);

      table.setSearch("choclate");

      expect(table.search()).toBe("choclate");
      expect(table.page()).toBe(1);
      expect(table.state().filter.search).toBe("choclate");
    });

    it("survives the filter dialog replacing the filter", () => {
      table.setSearch("milk");

      table.setFilter(filledFilter);

      expect(table.search()).toBe("milk");
      expect(table.state().filter.name).toEqual(filledFilter.name);
    });

    it("is cleared by a filter reset", () => {
      table.setSearch("milk");

      table.resetFilter();

      expect(table.search()).toBe("");
    });

    it("is empty for a state persisted before the box existed, and is not counted as a filter", () => {
      seedStore(table, { filter: undefined as any });
      expect(table.search()).toBe("");

      seedStore(table, { filter: { ...buildDefaultReceiptFilter(), search: "milk" } });
      expect(table.numFiltersApplied()).toBe(0);
    });
  });

  it("should reset filter", () => {
    seedStore(table, {
      filter: filledFilter,
    });

    expect(table.state().filter).toEqual(
      filledFilter
    );

    table.resetFilter();

    const result = table.state().filter;
    expect(result).toEqual(defaultReceiptFilter);
  });
  it("should count a zero-valued filter field", () => {
    seedStore(table, {
      filter: { ...defaultReceiptFilter, amount: { operation: FilterOperation.Equals, value: 0 } },
    });

    expect(table.numFiltersApplied()).toEqual(1);
  });

  it("should set a single filter field, leaving the others alone", () => {
    table.setFilterField("status", {
      operation: FilterOperation.Contains,
      value: [ReceiptStatus.Open],
    });

    const result = table.state().filter as any;
    expect(result.status).toEqual({
      operation: FilterOperation.Contains,
      value: [ReceiptStatus.Open],
    });
    expect(result.categories).toEqual({ operation: null, value: [] });
    expect(result.date).toEqual({ operation: null, value: null });
  });

  it("should clear a single filter field back to its default empty shape", () => {
    seedStore(table, { filter: filledFilter });

    table.setFilterField("categories", null);
    table.setFilterField("date", null);

    const result = table.state().filter as any;
    // A list field clears to [], a scalar to null.
    expect(result.categories).toEqual({ operation: null, value: [] });
    expect(result.date).toEqual({ operation: null, value: null });
    expect(result.name).toEqual(filledFilter.name);
  });

  it("should set the quick date field", () => {
    table.setQuickDateField("resolvedDate");

    expect(table.quickDateField()).toEqual("resolvedDate");
  });

  // The quick date field arrived after this slice was already being kept in
  // localStorage. What was kept is laid over the defaults (state-store.spec.ts),
  // and the reader has its own fallback for a slice that names the key without a value.
  it("should fall back to date for a state persisted before the key existed", () => {
    seedStore(table, { filter: filledFilter, quickDateField: undefined });

    expect(table.quickDateField()).toEqual("date");
  });

  it("should reset the quick date field along with the filter", () => {
    table.setQuickDateField("createdAt");
    table.resetFilter();

    expect(table.quickDateField()).toEqual("date");
  });

  // A reset writes a default filter straight into state, so without a
  // fresh object per write a later field update would corrupt the module-level
  // default for the rest of the session.
  it("should never mutate the exported default filter", () => {
    table.resetFilter();
    table.setFilterField("name", { operation: FilterOperation.Contains, value: "whole" });

    expect(defaultReceiptFilter).toEqual(buildDefaultReceiptFilter());
    expect((defaultReceiptFilter as any).name).toEqual({ operation: null, value: null });
  });
});
