import { PermissionScope, Role } from "../open-api";
import { marker } from "../i18n/marker";

/**
 * The roles are fixed: **Admin** and **User** in the app, and the same two names for a household's
 * Owner and Member. The rows keep the names they were seeded under (keep in step with the API's
 * `repositories/system_role_names.go`); nothing creates, changes or deletes a role.
 */
const ADMIN_ROLE_NAME: Record<string, string> = {
  [PermissionScope.App]: marker("Legacy Admin"),
  [PermissionScope.Group]: marker("Legacy Owner"),
};

const USER_ROLE_NAME: Record<string, string> = {
  [PermissionScope.App]: "User",
  [PermissionScope.Group]: "Member",
};

export const FAMILY_ADMIN_LABEL = marker("Admin");

export const FAMILY_USER_LABEL = "User";

/** "Admin" or "User" for the fixed roles; anything else keeps its own name. */
export function familyRoleName(role: Pick<Role, "name" | "scope">): string {
  if (role.name === ADMIN_ROLE_NAME[role.scope]) {
    return FAMILY_ADMIN_LABEL;
  }
  if (role.name === USER_ROLE_NAME[role.scope]) {
    return FAMILY_USER_LABEL;
  }
  return role.name;
}

/** The User role of a scope, which a new account or member gets. */
export function familyUserRole(roles: Role[], scope: PermissionScope): Role | undefined {
  return roles.find((role) => role.scope === scope && role.name === USER_ROLE_NAME[scope]);
}

/** A role picker's options: Admin, then User, named that way. */
export function familyRoleOptions(roles: Role[], scope: PermissionScope): Role[] {
  const inScope = roles.filter((role) => role.scope === scope);
  const admin = inScope.find((role) => role.name === ADMIN_ROLE_NAME[scope]);
  const user = inScope.find((role) => role.name === USER_ROLE_NAME[scope]);

  return [admin, user]
    .filter((role): role is Role => !!role)
    .map((role) => ({ ...role, name: familyRoleName(role) }));
}
