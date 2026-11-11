import { GroupLookPickerComponent } from "../group-look-picker/group-look-picker.component";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { FormControl, FormGroup, ReactiveFormsModule } from "@angular/forms";
import { AppDialog } from "../../dialog/app-dialog";
import { ActivatedRoute, Router, provideRouter } from "@angular/router";
import { NgxsModule, Store } from "@ngxs/store";
import { of } from "rxjs";
import { FormMode } from "src/enums/form-mode.enum";
import { SelectModule } from "src/select/select.module";
import { SharedUiModule } from "src/shared-ui/shared-ui.module";
import { TableModule } from "src/table/table.module";
import { UserAutocompleteModule } from "src/user-autocomplete/user-autocomplete.module";
import { CheckboxModule } from "../../checkbox/checkbox.module";
import { InputModule } from "../../input";
import { ApiModule, Group, GroupsService, GroupStatus, Permission } from "../../open-api";
import { GroupStore, AuthStore } from "../../store";
import { AppInitService } from "../../services";
import { GroupMemberFormComponent } from "../group-member-form/group-member-form.component";
import { buildGroupMemberForm } from "../utils/group-member.utils";
import { GroupFormComponent } from "./group-form.component";
import { provideHttpClient, withInterceptorsFromDi } from "@angular/common/http";

describe("GroupFormComponent", () => {
  let component: GroupFormComponent;
  let fixture: ComponentFixture<GroupFormComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
    imports: [ApiModule,
        CheckboxModule,
        InputModule,
        NgxsModule.forRoot([]),
        ReactiveFormsModule,
        SelectModule,
        SharedUiModule,
        TableModule,
        UserAutocompleteModule,
        GroupLookPickerComponent, GroupFormComponent, GroupMemberFormComponent],
    providers: [
        provideRouter([]),
        {
            provide: ActivatedRoute,
            useValue: {
                snapshot: {
                    data: {
                        group: {},
                        formConfig: { mode: FormMode.add },
                    },
                },
            },
        },
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
    ]
}).compileComponents();

    fixture = TestBed.createComponent(GroupFormComponent);
    component = fixture.componentInstance;
    Object.defineProperty(component, 'table', {
      value: () => ({
        sort: () => ({}),
      }),
      configurable: true,
    });
    // fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("should add user to group member on add", () => {
    const dialog = TestBed.inject(AppDialog);
    const formGroup = buildGroupMemberForm();
    formGroup.patchValue({
      userId: "2",
      groupId: "1",
      groupRoleId: 10,
    });
    vi.spyOn(dialog, "open").mockReturnValue({
      afterClosed: () => of(formGroup),
      componentInstance: { currentGroupMembers: [] },
    } as any);
    component.ngOnInit();
    component.ngAfterViewInit();

    component.addGroupMemberClicked();

    expect(component.groupMembers.value).toEqual([formGroup.value]);
    expect(component.dataSource().data).toEqual([formGroup.value]);
  });

  it("should update form on edit", () => {
    const result = [
      {
        userId: 2,
        groupRoleId: null,
        groupId: 1,
      },
      {
        userId: 3,
        groupRoleId: null,
        groupId: 1,
      },
    ];
    const dialog = TestBed.inject(AppDialog);
    const formGroup = buildGroupMemberForm();
    formGroup.patchValue({
      userId: 3,
      groupId: 1,
    });
    vi.spyOn(dialog, "open").mockReturnValue({
      afterClosed: () => of(formGroup),
      componentInstance: { currentGroupMembers: [] },
    } as any);
    const route = TestBed.inject(ActivatedRoute);
    route.snapshot.data = {
      group: {
        id: 1,
        name: "test",
        isDefault: true,
        groupMembers: [
          {
            userId: 2,
            groupId: 1,
          },
          {
            userId: 1,
            groupId: 1,
          },
        ],
      },
      formConfig: {},
    };

    component.ngOnInit();
    component.ngAfterViewInit();

    component.editGroupMemberClicked(1);

    expect(component.groupMembers.value).toEqual(result);
    expect(component.dataSource().data).toEqual(result as any);
  });

  it("should remove user to group member on remove", () => {
    const route = TestBed.inject(ActivatedRoute);
    const result = {
      userId: 1,
      groupRoleId: null,
      groupId: 1,
    };

    route.snapshot.data = {
      group: {
        id: 1,
        name: "test",
        isDefault: true,
        groupMembers: [
          {
            userId: 2,
            groupId: 1,
          },
          result,
        ],
      },
      formConfig: {},
    };

    component.ngOnInit();
    component.ngAfterViewInit();

    component.removeGroupMember(0);

    expect(component.groupMembers.value).toEqual([result]);
    expect(component.dataSource().data).toEqual([result] as any);
  });

  it("should create group", () => {
    const createSpy = vi.spyOn(TestBed.inject(GroupsService), "createGroup");
    const storeSpy = vi.spyOn(TestBed.inject(Store), "dispatch");
    const routerSpy = vi.spyOn(TestBed.inject(Router), "navigate").mockResolvedValue(true);
    vi.spyOn(TestBed.inject(AppInitService), "getAppData").mockReturnValue(of({} as any));

    const group: Group = {
      id: 1,
      name: "test",
      isDefault: true,
      groupMembers: [],
      status: GroupStatus.Active,
      isAllGroup: false,
      groupReceiptSettings: {} as any,
    };

    const route = TestBed.inject(ActivatedRoute);
    route.snapshot.data = {
      formConfig: {
        mode: FormMode.add,
      },
    };

    component.ngOnInit();
    component.ngAfterViewInit();

    component.form.patchValue({
      name: group.name,
      isDefault: group.isDefault,
    });

    const returnValue = {
      ...component.form.value,
      id: 1,
    };

    createSpy.mockReturnValue(of(returnValue));

    component.submit();

    expect(createSpy).toHaveBeenCalledWith({
      name: "test",
      status: GroupStatus.Active,
      groupMembers: [],
      icon: "",
      color: "",
    } as any);
    expect(TestBed.inject(GroupStore).groups()).toContainEqual(returnValue);
    expect(routerSpy).toHaveBeenCalledWith(["/groups/1/details/view"], {
      queryParams: {
        tab: "details",
      }
    });
  });

  it("should update group", () => {
    const updateSpy = vi.spyOn(TestBed.inject(GroupsService), "updateGroup");
    const updateGroup = vi.spyOn(TestBed.inject(GroupStore), "updateGroup");
    const routerSpy = vi.spyOn(TestBed.inject(Router), "navigate").mockResolvedValue(true);
    vi.spyOn(TestBed.inject(AppInitService), "getAppData").mockReturnValue(of({} as any));

    const group: Group = {
      id: 1,
      name: "test",
      isDefault: true,
      status: GroupStatus.Active,
      groupMembers: [
        {
          userId: 2,
          groupRoleId: 10,
          groupId: 1,
        },
        {
          userId: 1,
          groupRoleId: 11,
          groupId: 1,
        },
      ],
      isAllGroup: false,
      groupReceiptSettings: {} as any,
    };

    const route = TestBed.inject(ActivatedRoute);
    route.snapshot.data = {
      group: group,
      formConfig: {
        mode: FormMode.edit,
      },
    };

    component.ngOnInit();
    component.ngAfterViewInit();

    component.form.patchValue({
      name: "new name",
    });

    component.groupMembers.push(
      new FormGroup({
        userId: new FormControl(3),
        groupRoleId: new FormControl(12),
        groupId: new FormControl(1),
      })
    );

    const returnValue = {
      ...component.form.value,
      id: 1,
    };

    updateSpy.mockReturnValue(of(returnValue));

    component.submit();

    expect(updateSpy).toHaveBeenCalledWith(
      component.originalGroup?.id as number,
      {
        name: "new name",
        status: GroupStatus.Active,
        groupMembers: [
          {
            userId: 2,
            groupRoleId: 10,
            groupId: 1,
          },
          {
            userId: 1,
            groupRoleId: 11,
            groupId: 1,
          },
          {
            userId: 3,
            groupRoleId: 12,
            groupId: 1,
          },
        ],
        icon: "",
        color: "",
      } as Group
    );
    expect(updateGroup).toHaveBeenCalledWith(returnValue);
    // The form stays where it is (always editable): it settles instead of navigating to a view page.
    expect(component.form.pristine).toBe(true);
  });

  it("hydrates the household's icon and colour and sends them with the save", () => {
    const updateSpy = vi.spyOn(TestBed.inject(GroupsService), "updateGroup");
    vi.spyOn(TestBed.inject(AppInitService), "getAppData").mockReturnValue(of({} as any));
    const route = TestBed.inject(ActivatedRoute);
    route.snapshot.data = {
      group: { id: 1, name: "test", status: GroupStatus.Active, icon: "dog", color: "teal", groupMembers: [{ userId: 1, groupRoleId: 11, groupId: 1 }] },
      formConfig: { mode: FormMode.edit },
    };

    component.ngOnInit();
    expect(component.form.get("icon")?.value).toBe("dog");
    expect(component.form.get("color")?.value).toBe("teal");

    component.form.patchValue({ icon: "", color: "pink" });
    updateSpy.mockReturnValue(of({ ...component.form.value, id: 1 }));
    component.submit();

    expect(updateSpy).toHaveBeenCalledWith(1, expect.objectContaining({ icon: "", color: "pink" }));
  });

  it("starts a new household with the default look", () => {
    const route = TestBed.inject(ActivatedRoute);
    route.snapshot.data = { formConfig: { mode: FormMode.add } };

    component.ngOnInit();

    expect(component.form.get("icon")?.value).toBe("");
    expect(component.form.get("color")?.value).toBe("");
  });

  it("submits in edit mode even when no member holds an owner role", () => {
    // The legacy "must have at least one owner" guard was removed with the
    // group-role enums; the backend no longer enforces an owner, so the client
    // must save a non-owner-only membership without blocking.
    const updateSpy = vi.spyOn(TestBed.inject(GroupsService), "updateGroup");
    vi.spyOn(TestBed.inject(Router), "navigate").mockResolvedValue(true);
    vi.spyOn(TestBed.inject(AppInitService), "getAppData").mockReturnValue(of({} as any));

    const route = TestBed.inject(ActivatedRoute);
    route.snapshot.data = {
      group: {
        id: 1,
        name: "test",
        status: GroupStatus.Active,
        groupMembers: [{ userId: 2, groupRoleId: 11, groupId: 1 }],
      },
      formConfig: { mode: FormMode.edit },
    };

    component.ngOnInit();
    component.ngAfterViewInit();

    updateSpy.mockReturnValue(of({ id: 1 } as Group) as any);

    component.submit();

    expect(updateSpy).toHaveBeenCalled();
  });

  it("keeps member controls enabled in create mode (the creator owns the new group)", () => {
    const route = TestBed.inject(ActivatedRoute);
    route.snapshot.data = { formConfig: { mode: FormMode.add } }; // no group => create

    component.ngOnInit();

    expect(component.canCreateGroupMembers()).toBe(true);
    expect(component.canUpdateGroupMembers()).toBe(true);
    expect(component.canDeleteGroupMembers()).toBe(true);
  });

  it("hides member controls in edit mode without group.members.* permissions", () => {
    TestBed.inject(AuthStore).setPermissions([], {});
    const route = TestBed.inject(ActivatedRoute);
    route.snapshot.data = {
      group: { id: 1, name: "test", status: GroupStatus.Active, groupMembers: [] },
      formConfig: { mode: FormMode.edit },
    };

    component.ngOnInit();

    expect(component.canCreateGroupMembers()).toBe(false);
    expect(component.canUpdateGroupMembers()).toBe(false);
    expect(component.canDeleteGroupMembers()).toBe(false);
  });

  it("shows member controls in edit mode for holders of group.members.*", () => {
    TestBed.inject(AuthStore).setPermissions([], {
        1: [
          Permission.GroupMembersCreate,
          Permission.GroupMembersUpdate,
          Permission.GroupMembersDelete,
        ],
      });
    const route = TestBed.inject(ActivatedRoute);
    route.snapshot.data = {
      group: { id: 1, name: "test", status: GroupStatus.Active, groupMembers: [] },
      formConfig: { mode: FormMode.edit },
    };

    component.ngOnInit();

    expect(component.canCreateGroupMembers()).toBe(true);
    expect(component.canUpdateGroupMembers()).toBe(true);
    expect(component.canDeleteGroupMembers()).toBe(true);
  });
});
