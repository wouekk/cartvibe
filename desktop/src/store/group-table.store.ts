import { Injectable } from "@angular/core";
import { AssociatedGroup, GroupFilter, PagedGroupRequestCommand, SortDirection } from "../open-api";
import { PagedTableStore } from "./paged-table.store";

/** The households list: its page, page size and sort, kept between visits. It always asks for the person's own households. */
@Injectable({ providedIn: "root" })
export class GroupTableStore extends PagedTableStore<PagedGroupRequestCommand> {
  constructor() {
    super(
      () => ({
        page: 1,
        pageSize: 50,
        orderBy: "name",
        sortDirection: SortDirection.Desc,
        filter: { associatedGroup: AssociatedGroup.Mine } as GroupFilter,
      }),
      "groupTable"
    );
  }
}
