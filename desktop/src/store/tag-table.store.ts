import { Injectable } from "@angular/core";
import { SortDirection } from "../open-api";
import { PagedTableStore } from "./paged-table.store";

/** The tags list: its page, page size and sort, kept between visits. */
@Injectable({ providedIn: "root" })
export class TagTableStore extends PagedTableStore {
  constructor() {
    super(() => ({ page: 1, pageSize: 50, orderBy: "name", sortDirection: SortDirection.Desc }), "tagTable");
  }
}
