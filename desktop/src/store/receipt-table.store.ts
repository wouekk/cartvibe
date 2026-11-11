import { computed, Injectable } from "@angular/core";
import { DEFAULT_QUICK_DATE_FIELD, ReceiptDateFilterFieldKey } from "../constants/receipt-filter-fields.constant";
import { ReceiptTableInterface } from "../interfaces";
import { DEFAULT_RECEIPT_TABLE_COLUMNS, ReceiptTableColumnConfig } from "../interfaces/receipt-table-column-config.interface";
import { FilterOperation, ReceiptPagedRequestFilter } from "../open-api";
import { SortDirection } from "../table/table-types";
import { isFilterEntryActive } from "../utils/receipt-filter-entry";
import { PagedTableStore } from "./paged-table.store";

/**
 * A pristine filter. This is a factory rather than a shared constant because
 * the value is written straight into state on reset — handing out the same
 * object every time would let a later in-place edit corrupt the default for the
 * rest of the session.
 */
export function buildDefaultReceiptFilter(): ReceiptPagedRequestFilter {
  return {
    date: {
      operation: null,
      value: null
    },
    amount: {
      operation: null,
      value: null,
    },
    name: {
      operation: null,
      value: null,
    },
    paidBy: {
      operation: null,
      value: [],
    },
    categories: {
      operation: null,
      value: [],
    },
    tags: {
      operation: null,
      value: [],
    },
    status: {
      operation: null,
      value: [],
    },
    group: {
      operation: null,
      value: [],
    },
    resolvedDate: {
      operation: null,
      value: null,
    },
    createdAt: {
      operation: null,
      value: null,
    },
  } as ReceiptPagedRequestFilter;
}

export const defaultReceiptFilter = buildDefaultReceiptFilter();

/**
 * The ordering the table falls back to: the state default, and what a sort on a
 * column that no longer exists is reset to.
 */
export const DEFAULT_RECEIPT_ORDER_BY = "date";
export const DEFAULT_RECEIPT_SORT_DIRECTION: SortDirection = "desc";

/**
 * The receipts list: its page, sort, filter, search phrase and columns, kept between visits. One filter is shared
 * by every household (`GroupStore` clears it when the household changes). `state` is what the list sends.
 */
// TODO: look into fixing date equals
@Injectable({ providedIn: "root" })
export class ReceiptTableStore extends PagedTableStore<ReceiptTableInterface> {
  /** The phrase in the toolbar search box. A slice kept before the box existed has none. */
  public readonly search = computed(() => this.state().filter?.search ?? "");

  public readonly numFiltersApplied = computed(() => {
    const filter: any = this.state().filter;

    // Shares isFilterEntryActive with the filter chips, so the badge count and
    // the chips can never disagree about what counts as a condition.
    return Object.keys(filter).filter((key) => isFilterEntryActive(filter[key])).length;
  });

  /** The date field the quick date control targets. */
  public readonly quickDateField = computed((): ReceiptDateFilterFieldKey => this.state().quickDateField ?? DEFAULT_QUICK_DATE_FIELD);

  public readonly columnConfig = computed((): ReceiptTableColumnConfig[] => this.state().columnConfig || DEFAULT_RECEIPT_TABLE_COLUMNS);

  constructor() {
    super(
      () => ({
        page: 1,
        pageSize: 50,
        orderBy: DEFAULT_RECEIPT_ORDER_BY,
        sortDirection: DEFAULT_RECEIPT_SORT_DIRECTION,
        filter: buildDefaultReceiptFilter(),
        quickDateField: DEFAULT_QUICK_DATE_FIELD,
        columnConfig: DEFAULT_RECEIPT_TABLE_COLUMNS,
      }),
      "receiptTable"
    );
  }

  /** Replaces whatever keys the given state names (the list's own paging, sort and filter in one write). */
  public setFilterData(data: ReceiptTableInterface): void {
    this.patch(data);
  }

  public setFilter(filter: ReceiptPagedRequestFilter): void {
    // The filter dialog knows nothing of the toolbar search box, so its form value must not wipe the phrase.
    this.patch({ filter: { ...filter, search: this.state().filter?.search } });
  }

  /** The free-text phrase of the toolbar search box; empty clears it. Also returns the table to page 1. */
  public setSearch(search: string): void {
    this.patch({ page: 1, filter: { ...this.state().filter, search } });
  }

  /** Sets one condition; `null` clears the field back to its default empty shape. */
  public setFilterField(
    field: keyof ReceiptPagedRequestFilter,
    entry: { operation: FilterOperation | null; value: unknown } | null
  ): void {
    // A cleared field is rebuilt from a fresh default so the empty shape (list
    // fields go back to [], scalars to null) has one source of truth, and the
    // spread allocates a new container rather than writing through the current
    // filter — which may be shared with another reference.
    const clearedEntry = (buildDefaultReceiptFilter() as any)[field];

    this.patch({
      filter: {
        ...this.state().filter,
        [field]: entry ?? clearedEntry,
      },
    });
  }

  /** Which date field the quick date control writes to from now on. */
  public setQuickDateField(field: ReceiptDateFilterFieldKey): void {
    this.patch({ quickDateField: field });
  }

  public resetFilter(): void {
    // The targeted field is part of what the user configured, so a reset puts
    // the control back where a fresh install starts it.
    this.patch({
      filter: buildDefaultReceiptFilter(),
      quickDateField: DEFAULT_QUICK_DATE_FIELD,
    });
  }

  public setColumnConfig(columnConfig: ReceiptTableColumnConfig[]): void {
    this.patch({ columnConfig });
  }
}
