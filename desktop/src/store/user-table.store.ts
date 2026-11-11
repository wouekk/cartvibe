import { Injectable } from "@angular/core";
import { SortDirection } from "../open-api";
import { PagedTableStore } from "./paged-table.store";

/** The people list (System Settings): its page, page size and sort, kept between visits. */
@Injectable({ providedIn: "root" })
export class UserTableStore extends PagedTableStore {
  constructor() {
    super(() => ({ page: 1, pageSize: 50, orderBy: "username", sortDirection: SortDirection.Asc }), "userTable");
  }
}
