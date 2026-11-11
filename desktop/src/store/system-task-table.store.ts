import { computed, Injectable } from "@angular/core";
import { SystemTaskTableInterface } from "../interfaces";
import { SortDirection, SystemTaskPagedRequestFilter } from "../open-api";
import { isFilterEntryActive } from "../utils/receipt-filter-entry";
import { PagedTableStore } from "./paged-table.store";

/**
 * A pristine filter. This is a factory rather than a shared constant because
 * the value is written straight into state on reset — handing out the same
 * object every time would let a later in-place edit corrupt the default for the
 * rest of the session. Same reasoning as `buildDefaultReceiptFilter`.
 */
export function buildDefaultSystemTaskFilter(): SystemTaskPagedRequestFilter {
  return {
    type: {
      operation: null,
      value: [],
    },
    ranBy: {
      operation: null,
      value: [],
    },
    startedAt: {
      operation: null,
      value: null,
    },
    endedAt: {
      operation: null,
      value: null,
    },
  } as SystemTaskPagedRequestFilter;
}

/** The activity log: its page, page size, sort and filter, kept between visits. */
@Injectable({ providedIn: "root" })
export class SystemTaskTableStore extends PagedTableStore<SystemTaskTableInterface> {
  public readonly filter = computed((): SystemTaskPagedRequestFilter => this.state().filter ?? buildDefaultSystemTaskFilter());

  public readonly numFiltersApplied = computed(() => {
    const filter: any = this.filter();

    // Shares isFilterEntryActive with the filter chips, so the badge count and
    // the chips can never disagree about what counts as a condition.
    return Object.keys(filter).filter((key) => isFilterEntryActive(filter[key])).length;
  });

  constructor() {
    super(
      () => ({
        page: 1,
        pageSize: 50,
        orderBy: "started_at",
        sortDirection: SortDirection.Desc,
        filter: buildDefaultSystemTaskFilter(),
      }),
      "systemTaskTable"
    );
  }

  public setFilter(filter: SystemTaskPagedRequestFilter): void {
    this.patch({ filter });
  }

  /** Sets one condition; `null` clears the field back to its default empty shape. */
  public setFilterField(field: keyof SystemTaskPagedRequestFilter, entry: object | null): void {
    // A cleared field is rebuilt from a fresh default so the empty shape (list
    // fields go back to [], scalars to null) has one source of truth, and the
    // spread allocates a new container rather than writing through the current
    // filter — which may be shared with another reference.
    const clearedEntry = (buildDefaultSystemTaskFilter() as any)[field];

    this.patch({
      filter: {
        ...this.filter(),
        [field]: entry ?? clearedEntry,
      },
    });
  }

  public resetFilter(): void {
    this.patch({ filter: buildDefaultSystemTaskFilter() });
  }
}
