import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { PagedData, UserService } from "../../open-api";
import { BaseTableService } from "../../services/base-table.service";
import { UserTableStore } from "../../store/user-table.store";

@Injectable({
  providedIn: "root"
})
export class UserTableService extends BaseTableService {
  protected override readonly tableStore = inject(UserTableStore);

  private readonly userService = inject(UserService);

  public getPagedData(): Observable<PagedData> {
    return this.userService.getPagedUsers(this.getPagedRequestCommand());
  }
}
