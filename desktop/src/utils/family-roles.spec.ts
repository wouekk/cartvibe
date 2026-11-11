import { PermissionScope, Role } from "../open-api";
import { familyRoleName, familyRoleOptions, familyUserRole } from "./family-roles";

const role = (id: number, name: string, scope: PermissionScope): Role => ({ id, name, scope }) as Role;

const roles: Role[] = [
  role(1, "Legacy Admin", PermissionScope.App),
  role(3, "User", PermissionScope.App),
  role(1, "Legacy Owner", PermissionScope.Group),
  role(3, "Member", PermissionScope.Group),
];

describe("the fixed roles", () => {
  it("names the family roles Admin and User in each scope", () => {
    expect(familyRoleName(role(1, "Legacy Admin", PermissionScope.App))).toBe("Admin");
    expect(familyRoleName(role(3, "User", PermissionScope.App))).toBe("User");
    expect(familyRoleName(role(1, "Legacy Owner", PermissionScope.Group))).toBe("Admin");
    expect(familyRoleName(role(3, "Member", PermissionScope.Group))).toBe("User");
    expect(familyRoleName(role(2, "Legacy Viewer", PermissionScope.Group))).toBe("Legacy Viewer");
  });

  it("offers Admin and User only", () => {
    expect(familyRoleOptions(roles, PermissionScope.App).map((option) => [option.id, option.name])).toEqual([
      [1, "Admin"],
      [3, "User"],
    ]);
    expect(familyRoleOptions(roles, PermissionScope.Group).map((option) => option.name)).toEqual(["Admin", "User"]);
  });

  it("finds the role a new account or member gets", () => {
    expect(familyUserRole(roles, PermissionScope.App)?.id).toBe(3);
    expect(familyUserRole(roles, PermissionScope.Group)?.name).toBe("Member");
  });
});
