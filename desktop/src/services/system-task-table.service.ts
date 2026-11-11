import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { SystemTaskTableStore } from "../store/system-task-table.store";
import { BaseTableService } from "./base-table.service";

@Injectable()
export class SystemTaskTableService extends BaseTableService {
  protected override readonly tableStore = inject(SystemTaskTableStore);

  public getPagedData(): Observable<any> {
    throw new Error("Method not implemented.");
  }
}
