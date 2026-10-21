import { PermissionScope, Role } from "../open-api";
import { marker } from "../i18n/marker";

/**
 * The two roles a household sees (Phase 3 M4): **Admin** and **User**. They are the seeded system
 * roles below (keep in step with the API's `repositories/system_role_names.go`); the permission
 * system and every other role stay underneath, just not offered.
 */
const ADMIN_ROLE_NAME: Record<string, string> = {
  [PermissionScope.App]: "Legacy Admin",
  [PermissionScope.Group]: "Legacy Owner",
};

const USER_ROLE_NAME: Record<string, string> = {
  [PermissionScope.App]: "User",
  [PermissionScope.Group]: "Member",
};

export const FAMILY_ADMIN_LABEL = marker("Admin");

export const FAMILY_USER_LABEL = "User";

/** "Admin" or "User" for the family roles; any other role keeps its own name. */
export function familyRoleName(role: Pick<Role, "name" | "scope">): string {
  if (role.name === ADMIN_ROLE_NAME[role.scope]) {
    return FAMILY_ADMIN_LABEL;
  }
  if (role.name === USER_ROLE_NAME[role.scope]) {
    return FAMILY_USER_LABEL;
  }
  return role.name;
}

/** The family User role of a scope, which a new account or member gets. */
export function familyUserRole(roles: Role[], scope: PermissionScope): Role | undefined {
  return roles.find((role) => role.scope === scope && role.name === USER_ROLE_NAME[scope]);
}

/**
 * A role picker's options: Admin, then User, named that way. A role the account or member already
 * holds that is neither (an older install's) is listed too, under its own name, so opening and
 * saving the form never changes it unasked.
 */
export function familyRoleOptions(roles: Role[], scope: PermissionScope, currentRoleId?: number | null): Role[] {
  const inScope = roles.filter((role) => role.scope === scope);
  const admin = inScope.find((role) => role.name === ADMIN_ROLE_NAME[scope]);
  const user = inScope.find((role) => role.name === USER_ROLE_NAME[scope]);

  const options = [admin, user]
    .filter((role): role is Role => !!role)
    .map((role) => ({ ...role, name: familyRoleName(role) }));

  const current = inScope.find((role) => role.id === currentRoleId);
  if (current && current !== admin && current !== user) {
    options.push({ ...current, name: `${current.name} (older role)` });
  }

  return options;
}
