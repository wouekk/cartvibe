import { AfterViewInit, Component, computed, OnInit, TemplateRef, viewChild, inject, ChangeDetectionStrategy } from "@angular/core";
import { AppDialog } from "../../dialog/app-dialog";
import { take, tap } from "rxjs";
import { ConfirmationDialogComponent } from "src/shared-ui/confirmation-dialog/confirmation-dialog.component";
import { TableComponent } from "src/table/table/table.component";
import { DEFAULT_DIALOG_CONFIG, DEFAULT_HOST_CLASS } from "../../constants";
import { Group, GroupsService, Permission } from "../../open-api";
import { SnackbarService } from "../../services";
import { BaseTableService } from "../../services/base-table.service";
import { BaseTableComponent } from "../../shared-ui/base-table/base-table.component";
import { GroupStore, AuthStore } from "../../store";
import { GroupTableService } from "./group-table.service";
import { marker } from "../../i18n/marker";
import { TranslationService } from "../../i18n/translation.service";
import { Router, RouterLink } from "@angular/router";
import { hasAll, hasAny } from "../../utils/permission.utils";
import { ViewportService } from "../../services/viewport.service";
import { GroupTableEditButtonPipe } from "./group-table-edit-button.pipe";
import { RowAction, RowActionsComponent } from "../../shared-ui/row-actions/row-actions.component";
import { SettingsPageComponent } from "../../shared-ui/settings/settings-page.component";
import { ManagementTabsComponent } from "../../shared-ui/management-tabs/management-tabs.component";
import { HasAppPermissionDirective } from "../../directives/has-app-permission.directive";
import { AddButtonComponent } from "../../shared-ui/add-button/add-button.component";
import { SettingsEntityListComponent } from "../../shared-ui/settings/settings-entity-list.component";
import { AvatarComponent } from "../../avatar/avatar/avatar.component";
import { TranslatePipe } from "../../i18n/translate.pipe";
import { AppDatePipe } from "../../pipes/app-date.pipe";

@Component({
    selector: "app-group-table",
    templateUrl: "./group-table.component.html",
    host: DEFAULT_HOST_CLASS,
    providers: [
        {
            provide: BaseTableService,
            useClass: GroupTableService
        }
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [SettingsPageComponent, ManagementTabsComponent, HasAppPermissionDirective, AddButtonComponent, SettingsEntityListComponent, TableComponent, AvatarComponent, RouterLink, RowActionsComponent, TranslatePipe, AppDatePipe]
})
export class GroupTableComponent extends BaseTableComponent<Group> implements OnInit, AfterViewInit {
  private readonly authStore = inject(AuthStore);

  private readonly groupStore = inject(GroupStore);

  private readonly translation = inject(TranslationService);
  private readonly router = inject(Router);
  private readonly viewport = inject(ViewportService);

  public groups = this.groupStore.groups;

  /** The first answer replaces the empty source the table starts with; until then the list is still loading. */
  private readonly initialDataSource = this.dataSource();

  public readonly loaded = computed(() => this.dataSource() !== this.initialDataSource);

  public readonly emptyText = marker("No households yet.");

  private readonly nameCell = viewChild.required<TemplateRef<any>>("nameCell");

  private readonly numberOfMembersCell = viewChild.required<TemplateRef<any>>("numberOfMembersCell");

  private readonly createdAtCell = viewChild.required<TemplateRef<any>>("createdAtCell");

  private readonly updatedAtCell = viewChild.required<TemplateRef<any>>("updatedAtCell");

  private readonly actionsCell = viewChild.required<TemplateRef<any>>("actionsCell");

  private readonly table = viewChild.required(TableComponent);

  protected readonly Permission = Permission;

  public readonly appPermissions = this.authStore.appPermissions;

  public readonly groupPermissions = this.authStore.groupPermissions;

  public readonly canDeleteAnyGroup = computed(() => this.authStore.hasAppPermission(Permission.AppGroupsDelete));

  /**
   * Mirrors the backend's CanDeleteGroup rule: an ordinary user must stay in at
   * least one group, while an app.groups.delete holder cleaning up groups across
   * the system is exempt (they are typically not a member of what they delete).
   */
  public readonly deleteDisabled = computed(
    () => !this.canDeleteAnyGroup() && (this.groups()?.length ?? 0) <= 1
  );

  constructor(
    public override baseTableService: BaseTableService,
    private groupsService: GroupsService,
    private snackbarService: SnackbarService,
    private dialog: AppDialog
  ) {
    super(baseTableService);
  }

  public ngOnInit(): void {
    this.getTableData();
  }

  public ngAfterViewInit(): void {
    this.initTable();
  }

  private initTable(): void {
    this.setColumns();
  }

  private setColumns(): void {
    this.columns = [
      {
        columnHeader: "Name",
        columnDef: "name",
        template: this.nameCell(),
        sortable: true,
      },
      {
        columnHeader: marker("Number of Members"),
        columnDef: "number_of_members",
        template: this.numberOfMembersCell(),
        sortable: false,
      },
      {
        columnHeader: marker("Created At"),
        columnDef: "created_at",
        template: this.createdAtCell(),
        sortable: true,
      },
      {
        columnHeader: marker("Updated At"),
        columnDef: "updated_at",
        template: this.updatedAtCell(),
        sortable: true,
      },
      {
        columnHeader: marker("Actions"),
        columnDef: "actions",
        template: this.actionsCell(),
        sortable: false,
      },
    ];
  }

  /** On a phone the dates and the member count give way, so the row's menu stays on screen without scrolling sideways. */
  public readonly visibleColumns = computed(() =>
    this.viewport.isHandset()
      ? ["name", "actions"]
      : ["name", "number_of_members", "created_at", "updated_at", "actions"]
  );

  public canEdit(group: Group): boolean {
    // An app admin (app.groups.update) edits any household, also one they only joined as a Member.
    return (
      !group.isAllGroup &&
      (hasAny(this.appPermissions() ?? [], Permission.AppGroupsUpdate) ||
        hasAll(this.groupPermissions()?.[group.id] ?? [], Permission.GroupUpdate))
    );
  }

  public canDelete(group: Group): boolean {
    return (
      !group.isAllGroup &&
      (hasAny(this.appPermissions() ?? [], Permission.AppGroupsDelete) ||
        hasAll(this.groupPermissions()?.[group.id] ?? [], Permission.GroupDelete))
    );
  }

  /** The row's actions (app-row-actions): one stable array, judged per row. */
  public readonly rowActions: readonly RowAction<Group>[] = [
    { key: "edit", label: marker("Edit"), icon: "edit", testId: "group-edit", visible: (group) => this.canEdit(group) },
    {
      key: "delete",
      label: marker("Delete Household"),
      icon: "delete",
      testId: "group-delete",
      destructive: true,
      visible: (group) => this.canDelete(group),
      disabled: () => this.deleteDisabled(),
    },
  ];

  public rowAction(key: string, group: Group, index: number): void {
    if (key === "edit") {
      this.editGroup(group);
    } else if (key === "delete") {
      this.deleteGroup(index);
    }
  }

  public editGroup(group: Group): void {
    const link = new GroupTableEditButtonPipe().transform(group, this.appPermissions(), this.groupPermissions());
    this.router.navigateByUrl(link);
  }

  public deleteGroup(index: number): void {
    if (!this.deleteDisabled()) {
      const group = this.dataSource().data[index];
      const dialogRef = this.dialog.open(
        ConfirmationDialogComponent,
        DEFAULT_DIALOG_CONFIG
      );

      dialogRef.componentInstance.headerText = marker("Delete Group");
      dialogRef.componentInstance.confirmText = marker("Delete");
      dialogRef.componentInstance.dialogContent = this.translation.t("Are you sure you want to delete the group '{name}'? All receipts will be deleted as a result.", { name: group.name });

      dialogRef.afterClosed().subscribe((r) => {
        if (r) {
          this.groupsService
            .deleteGroup(group.id)
            .pipe(
              take(1),
              tap(() => {
                this.snackbarService.success("Group successfully deleted");
                // Keeps the GroupState cache in sync; a no-op for a group the
                // caller is not a member of (an app.groups.delete cleanup).
                this.groupStore.removeGroup(group.id.toString());
                // Refetch rather than swapping in the caller's own groups: this
                // table is server-paged and may be showing the all-groups filter.
                this.getTableData();
              })
            )
            .subscribe();
        }
      });
    }
  }
}
