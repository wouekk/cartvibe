import {AfterViewInit, Component, DestroyRef, OnInit, Signal, signal, TemplateRef, inject, input, viewChild, ChangeDetectionStrategy} from "@angular/core";
import {takeUntilDestroyed, toSignal} from "@angular/core/rxjs-interop";
import {FormArray, FormBuilder, FormGroup, Validators} from "@angular/forms";
import { AppDialog } from "../../dialog/app-dialog";
import { Sort, TableDataSource } from "../../table/table-types";
import {ActivatedRoute, Router} from "@angular/router";
import {Store} from "@ngxs/store";
import {map, startWith, switchMap, take, tap} from "rxjs";
import {DEFAULT_HOST_CLASS} from "src/constants";
import {GROUP_STATUS_OPTIONS} from "src/constants/receipt-status-options";
import {FormMode} from "src/enums/form-mode.enum";
import {FormConfig} from "src/interfaces/form-config.interface";
import {TableColumn} from "src/table/table-column.interface";
import {TableComponent} from "src/table/table/table.component";
import {SortByDisplayName} from "src/utils/sort-by-displayname";
import {Group, GroupMember, GroupsService, GroupStatus, Permission, PermissionScope, Role, RoleService} from "../../open-api";
import {loadAssignableRoles} from "../../roles/role-loading.util";
import {AppInitService, SnackbarService} from "../../services";
import {AddGroup, AuthState, UpdateGroup} from "../../store";
import {GroupMemberFormComponent} from "../group-member-form/group-member-form.component";
import {buildGroupMemberForm} from "../utils/group-member.utils";
import { marker } from "../../i18n/marker";

@Component({
    selector: "app-create-group-form",
    templateUrl: "./group-form.component.html",
    styleUrls: ["./group-form.component.scss"],
    host: DEFAULT_HOST_CLASS,
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class GroupFormComponent implements OnInit, AfterViewInit {
  protected readonly PermissionScope = PermissionScope;
  private readonly destroyRef = inject(DestroyRef);

  public readonly nameCell = viewChild.required<TemplateRef<any>>("nameCell");

  public readonly roleCell = viewChild.required<TemplateRef<any>>("roleCell");

  public readonly actionsCell = viewChild.required<TemplateRef<any>>("actionsCell");

  public readonly table = viewChild.required(TableComponent);

  public readonly canEdit = input(true);

  public form: FormGroup = new FormGroup({});

  public get groupMembers(): FormArray {
    return this.form.get("groupMembers") as FormArray;
  }

  public formConfig!: FormConfig;

  public originalGroup: Group | undefined = undefined;

  public displayedColumns: string[] = [];

  public columns: TableColumn[] = [];

  public disableDeleteButton: boolean = false;

  public editLink: string = "";

  // Roles resolve each member's groupRoleId to a role name. group-form is
  // rendered for every group member (including non-admins), so the request is
  // skipped entirely unless the caller holds app.roles.read — otherwise the 403
  // would log them out (see loadAssignableRoles). Non-holders see a blank name.
  public readonly roles = toSignal(
    loadAssignableRoles(inject(Store), inject(RoleService)),
    { initialValue: [] as Role[] }
  );

  public groupStatusOptions = GROUP_STATUS_OPTIONS;

  // Member-management controls gate on the granular group.members.* permissions
  // (mirroring the backend UpdateGroup enforcement). Default to true so create mode
  // — where there is no group yet and the creator becomes its owner — is unrestricted;
  // edit/view mode resolves them from the caller's permissions in ngOnInit.
  public canCreateGroupMembers: Signal<boolean> = signal(true);
  public canUpdateGroupMembers: Signal<boolean> = signal(true);
  public canDeleteGroupMembers: Signal<boolean> = signal(true);

  public dataSource = signal(new TableDataSource<GroupMember>([]));

  constructor(
    private formBuilder: FormBuilder,
    private groupsService: GroupsService,
    private snackbarService: SnackbarService,
    private router: Router,
    private store: Store,
    private activatedRoute: ActivatedRoute,
    private matDialog: AppDialog,
    private sortByDisplayName: SortByDisplayName,
    private appInitService: AppInitService
  ) {
  }

  public ngOnInit(): void {
    this.originalGroup = this.activatedRoute.snapshot.data["group"];
    this.formConfig = this.activatedRoute.snapshot.data["formConfig"];
    // Always editable for anyone who may update (Save in the card footer), like the other settings pages.
    if (
      this.formConfig.mode === FormMode.view &&
      this.originalGroup &&
      this.store.selectSnapshot(AuthState.hasGroupPermission(this.originalGroup.id, Permission.GroupUpdate))
    ) {
      this.formConfig = { ...this.formConfig, mode: FormMode.edit };
    }
    if (this.originalGroup) {
      this.editLink = `/groups/${this.originalGroup.id}/details/edit`;
      this.canCreateGroupMembers = this.store.selectSignal(
        AuthState.hasGroupPermission(this.originalGroup.id, Permission.GroupMembersCreate)
      );
      this.canUpdateGroupMembers = this.store.selectSignal(
        AuthState.hasGroupPermission(this.originalGroup.id, Permission.GroupMembersUpdate)
      );
      this.canDeleteGroupMembers = this.store.selectSignal(
        AuthState.hasGroupPermission(this.originalGroup.id, Permission.GroupMembersDelete)
      );
    }
    this.initForm();
  }

  public ngAfterViewInit(): void {
    this.initTable();
  }

  private initTable(): void {
    this.setColumns();
    this.setDataSource();
    this.listenForGroupMemberChanges();
  }

  private listenForGroupMemberChanges(): void {
    this.groupMembers.valueChanges
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        tap((v) => {
          this.dataSource.set(new TableDataSource<GroupMember>(Array.from(v)));
        })
      )
      .subscribe();
  }

  private setColumns(): void {
    this.columns = [
      {
        columnHeader: "Name",
        matColumnDef: "name",
        template: this.nameCell(),
        sortable: true,
      },
      {
        columnHeader: marker("Group Role"),
        matColumnDef: "role",
        template: this.roleCell(),
        sortable: true,
      },
      {
        columnHeader: marker("Actions"),
        matColumnDef: "actions",
        template: this.actionsCell(),
        sortable: true,
      },
    ];
    this.displayedColumns = ["name", "role"];

    if (this.formConfig.mode !== FormMode.view) {
      this.displayedColumns.push("actions");
    }
  }

  private setDataSource(): void {
    const ds = new TableDataSource<GroupMember>(
      this.groupMembers.value ?? []
    );
    this.dataSource.set(ds);
  }

  public sortName(sortState: Sort): void {
    if (sortState.active === "name") {
      if (sortState.direction === "") {
        this.dataSource.set(new TableDataSource<GroupMember>(this.groupMembers.value));
        return;
      }

      const newData = this.sortByDisplayName.sort(
        this.dataSource().data,
        sortState,
        "userId"
      );

      this.dataSource.set(new TableDataSource<GroupMember>(newData));
    }
  }

  private initForm(): void {
    let groupMembers: FormGroup[] = [];
    if (this.originalGroup?.groupMembers) {
      groupMembers = this.originalGroup.groupMembers.map((m) =>
        buildGroupMemberForm(m)
      );
    }
    this.form = this.formBuilder.group({
      name: [this.originalGroup?.name ?? "", Validators.required],
      groupMembers: this.formBuilder.array(groupMembers),
      status: this.originalGroup?.status ?? GroupStatus.Active,
      isolateMembers: this.originalGroup?.isolateMembers ?? false,
    });

    this.groupMembers.valueChanges
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        startWith(this.groupMembers.value),
        tap((v) => {
          this.disableDeleteButton = v.length === 1;
        })
      )
      .subscribe();

    if (this.formConfig.mode === FormMode.view) {
      this.form.get("status")?.disable();
    }
  }

  public addGroupMemberClicked(): void {
    const dialogRef = this.matDialog.open(GroupMemberFormComponent);

    dialogRef.componentInstance.currentGroupMembers = this.groupMembers.value;
    dialogRef.componentInstance.headerText = marker("Add Group Member");

    dialogRef
      .afterClosed()
      .pipe(take(1))
      .subscribe((form) => {
        if (form) {
          this.groupMembers.push(form);
        }
      });
  }

  public editGroupMemberClicked(index: number): void {
    const groupMember = this.groupMembers.at(index).value;
    const dialogRef = this.matDialog.open(GroupMemberFormComponent);

    dialogRef.componentInstance.currentGroupMembers = this.groupMembers.value;
    dialogRef.componentInstance.groupMember = groupMember;
    dialogRef.componentInstance.headerText = marker("Edit Group Member");

    dialogRef
      .afterClosed()
      .pipe(take(1))
      .subscribe((form) => {
        if (form) {
          this.groupMembers.at(index).patchValue(form.value);
        }
      });
  }

  public removeGroupMember(index: number): void {
    this.groupMembers.removeAt(index);
  }

  public submit(): void {
    if (this.form.valid) {
      switch (this.formConfig.mode) {
        case FormMode.add:
          this.createGroup();

          break;
        case FormMode.edit:
          this.updateGroup();
          break;

        default:
          break;
      }
    }
  }

  private createGroup(): void {
    this.groupsService
      .createGroup(this.form.value)
      .pipe(
        take(1),
        tap(() => {
          this.snackbarService.success("Group successfully created");
        }),
        switchMap((group: Group) => {
          this.store.dispatch(new AddGroup(group));
          // Reload app data so the group creator's permissions for the new
          // group load before navigating into the permission-gated group route.
          return this.appInitService.getAppData().pipe(map(() => group));
        }),
        tap((group: Group) => {
          this.navigateToGroupDetails(group.id);
        })
      )
      .subscribe();
  }

  private updateGroup(): void {
    this.groupsService
      .updateGroup(this.originalGroup?.id ?? 0, this.form.value)
      .pipe(
        take(1),
        tap((group: Group) => {
          this.snackbarService.success("Group successfully updated");
          this.store.dispatch(new UpdateGroup(group));
        }),
        switchMap((group: Group) =>
          // Reload app data so any membership/role changes affecting the current
          // user are reflected in permissions before navigating into the group.
          this.appInitService.getAppData().pipe(map(() => group))
        ),
        tap((group: Group) => {
          this.originalGroup = group;
          this.form.markAsPristine();
        })
      )
      .subscribe();
  }

  private navigateToGroupDetails(groupId: number): void {
    this.router.navigate([`/groups/${groupId}/details/view`],
      {
        queryParams: {tab: "details"}
      });
  }
}
