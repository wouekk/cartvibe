import { Injectable, inject } from "@angular/core";
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, } from "@angular/router";
import { GroupStore } from "../store";

@Injectable({
  providedIn: "root",
})
export class GroupGuard {
  private readonly groupStore = inject(GroupStore);

  constructor(private router: Router) {}

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): boolean {
    const groupId = route.params["groupId"];
    const group = this.groupStore.getGroupById(groupId);

    if (group) {
      this.open(groupId?.toString() ?? "");
      return true;
    } else {
      const newGroupId = this.groupStore.groups()[0]?.id;
      const basePath = route.data["groupGuardBasePath"];

      this.open(newGroupId?.toString() ?? "");
      this.router.navigate([`${basePath}/${newGroupId}`]);
      return false;
    }
  }

  /** Makes the household of the address the open one. */
  private open(groupId: string): void {
    if (groupId !== this.groupStore.selectedGroupId()) {
      this.groupStore.setSelectedGroupId(groupId);
    }
  }
}
