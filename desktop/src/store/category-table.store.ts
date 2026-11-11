import { Injectable } from "@angular/core";
import { SortDirection } from "../open-api";
import { PagedTableStore } from "./paged-table.store";

/** The categories list: its page, page size and sort, kept between visits. */
@Injectable({ providedIn: "root" })
export class CategoryTableStore extends PagedTableStore {
  constructor() {
    super(() => ({ page: 1, pageSize: 50, orderBy: "name", sortDirection: SortDirection.Desc }), "categoryTable");
  }
}
