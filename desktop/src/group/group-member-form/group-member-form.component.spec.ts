import { provideHttpClient, withInterceptorsFromDi } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { CUSTOM_ELEMENTS_SCHEMA, provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ReactiveFormsModule } from "@angular/forms";
import { AppDialog, AppDialogRef } from "../../dialog/app-dialog";
import { NEVER, of, throwError } from "rxjs";
import {
  Category,
  CategoryService,
  Group,
  GroupMember,
  GroupsService,
  PermissionScope,
  Role,
  RoleService,
  Tag,
  TagService,
} from "../../open-api";
import { GroupMemberFormComponent } from "./group-member-form.component";

import type { Mock } from "vitest";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmTooltip } from "@spartan-ng/helm/tooltip";
import { AppIconComponent } from "../../shared-ui/icon/icon.component";
import { renderShallow } from "../../testing/render-shallow";
import { TranslatePipe } from "../../i18n/translate.pipe";
import { FormGetPipe } from "../../pipes/form-get.pipe";
import { seedStore } from "../../testing/seed-store";
import { AuthStore } from "../../store/auth.store";
describe("GroupMemberFormComponent", () => {
  const defaultGroupRole: Role = {
    id: 10,
    name: "Legacy Owner",
    description: "Group owner",
    scope: PermissionScope.Group,
    isDefault: true,
    isSystem: true,
    permissions: [],
  };

  // An app role is included to confirm the selector filters to group roles only.
  const appRole: Role = {
    id: 1,
    name: "Legacy Admin",
    description: "App admin",
    scope: PermissionScope.App,
    isDefault: true,
    isSystem: true,
    permissions: [],
  };

  let component: GroupMemberFormComponent;
  let fixture: ComponentFixture<GroupMemberFormComponent>;
  let getRolesMock: Mock;
  let dialogRefMock: { close: Mock };
  let getGroupByIdMock: Mock;
  let updateGrantsMock: Mock;

  const categoryPool = [
    { id: 1, name: "Child A" },
    { id: 2, name: "Child B" },
  ] as Category[];

  const cappedRole: Role = {
    id: 10,
    name: "Foster Parent",
    description: "",
    scope: PermissionScope.Group,
    isDefault: true,
    isSystem: false,
    permissions: [],
    categoryGrants: [1, 2],
    tagGrants: [],
  } as unknown as Role;

  /** A saved membership as the API returns it, carrying its grant ids. */
  function savedMember(categoryGrants: number[]): GroupMember {
    return {
      userId: 2,
      groupId: 5,
      groupRoleId: 10,
      categoryGrants,
      tagGrants: [],
    } as unknown as GroupMember;
  }

  beforeEach(async () => {
    getRolesMock = vi.fn().mockReturnValue(of([] as Role[]));
    dialogRefMock = { close: vi.fn() };
    getGroupByIdMock = vi.fn().mockReturnValue(of({ id: 5, groupMembers: [] } as unknown as Group));
    updateGrantsMock = vi.fn().mockReturnValue(of({}));
    // The children are left out: this spec mocks what they would read.
    renderShallow(GroupMemberFormComponent, [ReactiveFormsModule, TranslatePipe, FormGetPipe, HlmButton, HlmTooltip, AppIconComponent]);
    await TestBed.configureTestingModule({
    imports: [
                ReactiveFormsModule,
        GroupMemberFormComponent,
    ],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    providers: [
        provideZonelessChangeDetection(),
        { provide: AppDialogRef, useValue: dialogRefMock },
        { provide: RoleService, useValue: { getRoles: getRolesMock } },
        {
            provide: GroupsService,
            useValue: {
                getGroupById: (...args: unknown[]) => getGroupByIdMock(...args),
                updateGroupMemberGrants: (...args: unknown[]) => updateGrantsMock(...args),
            },
        },
        { provide: CategoryService, useValue: { getAllCategories: () => of(categoryPool) } },
        { provide: TagService, useValue: { getAllTags: () => of([] as Tag[]) } },
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
    ],
}).compileComponents();

    seedStore(TestBed.inject(AuthStore), { userId: "1" });
  });

  // Creates and initialises a fresh component after the role mock is configured;
  // the roles toSignal subscribes at construction, so the mock must be set first.
  async function createComponent(): Promise<void> {
    fixture = TestBed.createComponent(GroupMemberFormComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  }

  it("should create", async () => {
    await createComponent();
    expect(component).toBeTruthy();
  });

  it("defaults to the configured default group role on add", async () => {
    getRolesMock.mockReturnValue(of([appRole, defaultGroupRole]));
    await createComponent();

    expect(component.groupRoleOptions().map((role) => role.id)).toEqual([10]);
    expect(component.form.get("groupRoleId")?.value).toBe(10);
    expect(component.selectedRole()).toEqual(defaultGroupRole);
  });

  it("resolves the selected group role when an app role shares its id", async () => {
    // App and group role ids are independent and can collide. An app role
    // listed first with the same id must not be returned for the group selection.
    const collidingAppRole: Role = {
      id: 10,
      name: "Some App Role",
      description: "App role",
      scope: PermissionScope.App,
      isDefault: false,
      isSystem: false,
      permissions: [],
    };
    getRolesMock.mockReturnValue(of([collidingAppRole, defaultGroupRole]));
    await createComponent();

    expect(component.form.get("groupRoleId")?.value).toBe(10);
    expect(component.selectedRole()).toEqual(defaultGroupRole);
  });

  it("leaves the selector empty when roles fail to load", async () => {
    getRolesMock.mockReturnValue(throwError(() => new Error("forbidden")));
    await createComponent();

    expect(component).toBeTruthy();
    expect(component.groupRoleOptions()).toEqual([]);
    expect(component.form.get("groupRoleId")?.value).toBeNull();
  });

  it("opens the preview dialog for the selected role", async () => {
    getRolesMock.mockReturnValue(of([defaultGroupRole]));
    await createComponent();

    const openSpy = vi
      .spyOn(TestBed.inject(AppDialog), "open")
      .mockReturnValue({ afterClosed: () => of(undefined) } as any);

    component.previewRole();

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect((openSpy.mock.calls[0][1]?.data as any)?.role).toEqual(defaultGroupRole);
  });

  it("returns the form with the selected modern role on submit", async () => {
    getRolesMock.mockReturnValue(of([defaultGroupRole]));
    await createComponent();

    component.form.get("userId")?.setValue("2");
    component.form.get("groupRoleId")?.setValue(10);

    component.submit();

    expect(component.form.get("groupRoleId")?.value).toBe(10);
    expect(dialogRefMock.close).toHaveBeenCalledWith(component.form);
  });
});
