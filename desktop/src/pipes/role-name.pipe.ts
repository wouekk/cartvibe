import { Pipe, PipeTransform } from "@angular/core";
import { PermissionScope, Role } from "../open-api";
import { familyRoleName } from "../utils/family-roles";

@Pipe({
    name: "roleName",
    standalone: false
})
export class RoleNamePipe implements PipeTransform {
  // App and group roles have independent id sequences, so a role id is only
  // unique within a scope. Callers pass the scope of the id being resolved
  // (e.g. PermissionScope.App for a user's appRoleId) so a colliding id from
  // the other scope is never matched.
  public transform(
    id: number | undefined | null,
    roles: Role[],
    scope: PermissionScope
  ): string {
    if (id == null) {
      return "";
    }
    // The family roles read as "Admin" and "User" (Phase 3 M4).
    const role = roles.find((candidate) => candidate.id === id && candidate.scope === scope);
    return role ? familyRoleName(role) : "";
  }
}
