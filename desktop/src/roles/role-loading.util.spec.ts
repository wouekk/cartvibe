import { TestBed } from "@angular/core/testing";
import { firstValueFrom, of, throwError } from "rxjs";
import { PermissionScope, Role, RoleService } from "../open-api";
import { AuthStore } from "../store";
import { loadAssignableRoles } from "./role-loading.util";

import type { Mock } from "vitest";
describe("loadAssignableRoles", () => {
  let getRoles: Mock;
  let roleService: RoleService;

  const roles: Role[] = [
    {
      id: 1,
      name: "Legacy Admin",
      scope: PermissionScope.App,
      isDefault: false,
      isSystem: true,
      permissions: [],
    },
  ];

  beforeEach(() => {
    getRoles = vi.fn().mockReturnValue(of(roles));
    roleService = { getRoles } as unknown as RoleService;
  });

  function collect(): Promise<Role[]> {
    return firstValueFrom(loadAssignableRoles(TestBed.inject(AuthStore), roleService));
  }

  it("does NOT call getRoles when app.roles.read is absent", async () => {
    const result = await collect();
    expect(result).toEqual([]);
    expect(getRoles).not.toHaveBeenCalled();
  });

  it("loads roles when app.roles.read is held", async () => {
    TestBed.inject(AuthStore).setPermissions(["app.roles.read"], {});
    const result = await collect();
    expect(result).toEqual(roles);
    expect(getRoles).toHaveBeenCalledTimes(1);
  });

  it("degrades to an empty list when getRoles errors", async () => {
    TestBed.inject(AuthStore).setPermissions(["app.roles.read"], {});
    getRoles.mockReturnValue(throwError(() => new Error("boom")));
    const result = await collect();
    expect(result).toEqual([]);
  });
});
