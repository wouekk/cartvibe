import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { ReceiptProcessingSettingsTaskTableStore } from "../store/receipt-processing-settings-task-table.store";
import { BaseTableService } from "./base-table.service";

@Injectable()
export class ReceiptProcessingSettingsTaskTableService extends BaseTableService {
  protected override readonly tableStore = inject(ReceiptProcessingSettingsTaskTableStore);

  public getPagedData(): Observable<any> {
    throw new Error("Method not implemented.");
  }
}
