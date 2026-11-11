import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { GroupsService, PagedData } from "../../open-api";
import { BaseTableService } from "../../services/base-table.service";
import { GroupTableStore } from "../../store/group-table.store";

@Injectable({
  providedIn: "root"
})
export class GroupTableService extends BaseTableService {
  protected override readonly tableStore = inject(GroupTableStore);

  private readonly groupService = inject(GroupsService);

  public getPagedData(): Observable<PagedData> {
    return this.groupService.getPagedGroups(this.getPagedRequestCommand());
  }
}
