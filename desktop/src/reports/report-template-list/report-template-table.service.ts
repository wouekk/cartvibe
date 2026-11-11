import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { PagedData } from "../../open-api";
import { BaseTableService } from "../../services/base-table.service";
import { ReportTemplateTableStore } from "../../store/report-template-table.store";
import { ReportRunnerService } from "../services/report-runner.service";

/** Feeds the report-template list its paged data + page/sort state (mirrors GroupTableService). */
@Injectable({ providedIn: "root" })
export class ReportTemplateTableService extends BaseTableService {
  protected override readonly tableStore = inject(ReportTemplateTableStore);

  private readonly runner = inject(ReportRunnerService);

  public getPagedData(): Observable<PagedData> {
    return this.runner.listTemplates(this.getPagedRequestCommand());
  }
}
