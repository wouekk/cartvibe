import { Injectable } from "@angular/core";
import { SortDirection } from "../open-api";
import { PagedTableStore } from "./paged-table.store";

/** The activity list under an AI setting: its page, page size and sort, kept between visits. */
@Injectable({ providedIn: "root" })
export class ReceiptProcessingSettingsTaskTableStore extends PagedTableStore {
  constructor() {
    super(() => ({ page: 1, pageSize: 50, orderBy: "type", sortDirection: SortDirection.Desc }), "receiptProcessingSettingsTaskTable");
  }
}
