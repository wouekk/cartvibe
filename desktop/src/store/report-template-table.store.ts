import { Injectable } from "@angular/core";
import { SortDirection } from "../open-api";
import { PagedTableStore } from "./paged-table.store";

/** The report templates list: its page, page size and sort, kept between visits. */
@Injectable({ providedIn: "root" })
export class ReportTemplateTableStore extends PagedTableStore {
  constructor() {
    super(() => ({ page: 1, pageSize: 50, orderBy: "updated_at", sortDirection: SortDirection.Desc }), "reportTemplateTable");
  }
}
