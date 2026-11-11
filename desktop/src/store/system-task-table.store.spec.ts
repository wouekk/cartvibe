import { TestBed } from "@angular/core/testing";
import { FilterOperation, SortDirection } from "../open-api";
import { seedStore } from "../testing/seed-store";
import { buildDefaultSystemTaskFilter, SystemTaskTableStore } from "./system-task-table.store";

describe("SystemTaskTableStore", () => {
  let table: SystemTaskTableStore;

  beforeEach(() => {
    table = TestBed.inject(SystemTaskTableStore);
  });

  it("should set page", () => {
    table.setPage(2);
    const state = table.state();
    expect(state.page).toBe(2);
  });

  it("should set page size", () => {
    table.setPageSize(100);
    const state = table.state();
    expect(state.pageSize).toBe(100);
  });

  it("should set order by", () => {
    table.setOrderBy("type");
    const state = table.state();
    expect(state.orderBy).toBe("type");
  });

  it("should set sort direction", () => {
    table.setSortDirection(SortDirection.Asc);
    const state = table.state();
    expect(state.sortDirection).toBe(SortDirection.Asc);
  });

  it("defaults to a pristine filter", () => {
    expect(table.filter()).toEqual(buildDefaultSystemTaskFilter());
    expect(table.numFiltersApplied()).toBe(0);
  });

  it("hands out a fresh default each time, so an in-place edit cannot corrupt it", () => {
    const first: any = buildDefaultSystemTaskFilter();
    first.type.value.push("QUICK_SCAN");

    expect((buildDefaultSystemTaskFilter() as any).type.value).toEqual([]);
  });

  it("should set the whole filter and count the applied conditions", () => {
    table.setFilter({
      type: { operation: FilterOperation.Contains, value: ["QUICK_SCAN"] },
      ranBy: { operation: FilterOperation.Contains, value: [-1] },
      startedAt: { operation: null, value: null },
      endedAt: { operation: null, value: null },
    } as any);

    expect(table.numFiltersApplied()).toBe(2);
  });

  it("should clear a single field back to its default without touching the others", () => {
    table.setFilter({
      type: { operation: FilterOperation.Contains, value: ["QUICK_SCAN"] },
      ranBy: { operation: FilterOperation.Contains, value: [-1] },
      startedAt: { operation: null, value: null },
      endedAt: { operation: null, value: null },
    } as any);

    table.setFilterField("type", null);

    const filter: any = table.filter();
    expect(filter.type).toEqual({ operation: null, value: [] });
    expect(filter.ranBy.value).toEqual([-1]);
    expect(table.numFiltersApplied()).toBe(1);
  });

  it("should reset the filter", () => {
    table.setFilterField("ranBy", { operation: FilterOperation.Contains, value: [4] });
    table.resetFilter();

    expect(table.filter()).toEqual(buildDefaultSystemTaskFilter());
  });

  // What was kept is laid over the defaults (state-store.spec.ts), so a slice kept before the filter
  // shipped gets one. A slice that names the key without a value must still read as a pristine filter.
  it("falls back to a default filter when the persisted state carries none", () => {
    seedStore(table, { filter: undefined });

    expect(table.filter()).toEqual(buildDefaultSystemTaskFilter());
    expect(table.numFiltersApplied()).toBe(0);

    table.setFilterField("type", { operation: FilterOperation.Contains, value: ["QUICK_SCAN"] });

    const filter: any = table.filter();
    expect(filter.type.value).toEqual(["QUICK_SCAN"]);
    expect(filter.ranBy).toEqual({ operation: null, value: [] });
  });
});
