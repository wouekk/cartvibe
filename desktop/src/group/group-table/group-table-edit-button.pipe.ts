import { Pipe, PipeTransform } from "@angular/core";
import { Group, Permission } from "../../open-api";
import { hasAll, hasAny } from "../../utils/permission.utils";

@Pipe({
    name: "groupTableEditButton",
    standalone: false
})
export class GroupTableEditButtonPipe implements PipeTransform {

  public transform(
    group: Group,
    appPermissions: string[],
    groupPermissions: { [id: number]: string[] }
  ): string {
    if (
      hasAny(appPermissions ?? [], Permission.AppGroupsUpdate) ||
      hasAll(groupPermissions?.[group.id] ?? [], Permission.GroupUpdate)
    ) {
      return `/groups/${group.id}/details/edit`;
    }

    return `/groups/${group.id}/details/view`;
  }
}
