import { Component, DestroyRef, OnInit, computed, effect, inject, signal, ChangeDetectionStrategy } from "@angular/core";
import { takeUntilDestroyed, toSignal } from "@angular/core/rxjs-interop";
import { FormGroup, ReactiveFormsModule } from "@angular/forms";
import { AppDialog, AppDialogRef } from "../../dialog/app-dialog";
import { catchError, of, startWith } from "rxjs";
import {
  GroupMember,
  PermissionScope,
  Role,
  RoleService,
} from "../../open-api";
import { openRolePreviewDialog } from "../../roles/role-preview/role-preview-dialog.component";
import { AuthStore } from "../../store";
import { buildGroupMemberForm } from "../utils/group-member.utils";
import { familyRoleOptions, familyUserRole } from "../../utils/family-roles";
import { DialogComponent } from "../../shared-ui/dialog/dialog.component";
import { UserAutocompleteComponent } from "../../user-autocomplete/user-autocomplete/user-autocomplete.component";
import { SelectComponent } from "../../select/select/select.component";
import { DialogFooterComponent } from "../../shared-ui/dialog-footer/dialog-footer.component";
import { TranslatePipe } from "../../i18n/translate.pipe";
import { FormGetPipe } from "../../pipes/form-get.pipe";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmTooltip } from "@spartan-ng/helm/tooltip";
import { AppIconComponent } from "../../shared-ui/icon/icon.component";

@Component({
    selector: "app-group-member-form",
    host: { class: "block max-h-[85vh] overflow-y-auto" },
    templateUrl: "./group-member-form.component.html",
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [DialogComponent, ReactiveFormsModule, UserAutocompleteComponent, SelectComponent, DialogFooterComponent, TranslatePipe, FormGetPipe, HlmButton, HlmTooltip, AppIconComponent]
})
export class GroupMemberFormComponent implements OnInit {
  private readonly authStore = inject(AuthStore);

  public userId = this.authStore.userId;

  public headerText: string = "";

  public form: FormGroup = new FormGroup({});

  public usersToOmit: string[] = [];

  public currentGroupMembers: GroupMember[] = [];

  public groupMember: GroupMember | undefined = undefined;

  // The group-role list, the selector options and the currently-selected role
  // (for the preview button) are derived reactively so they update once the
  // roles load asynchronously. Degrade gracefully if the roles can't be read
  // (a household owner who is not an app admin lacks app.roles.read): the
  // selector is simply empty rather than erroring.
  private readonly roles = toSignal(
    inject(RoleService)
      .getRoles()
      .pipe(catchError(() => of([] as Role[]))),
    { initialValue: [] as Role[] }
  );
  private readonly selectedGroupRoleId = signal<number | null>(null);
  // The two household roles, offered as Admin and User.
  public readonly groupRoleOptions = computed<Role[]>(() =>
    familyRoleOptions(this.roles(), PermissionScope.Group)
  );
  // The role itself, not its relabelled option, so the preview shows its real name.
  public readonly selectedRole = computed<Role | null>(
    () =>
      this.roles().find(
        (role) => role.scope === PermissionScope.Group && role.id === this.selectedGroupRoleId()
      ) ?? null
  );

  constructor(
    private dialogRef: AppDialogRef<GroupMemberFormComponent>,
    private dialog: AppDialog,
    private destroyRef: DestroyRef
  ) {
    // A new member defaults to the User role once the roles resolve; an existing
    // member's role is already pre-filled from the loaded member. Syncing a
    // derived value into the reactive form is an imperative side effect, so an
    // effect() is the sanctioned tool here.
    effect(() => {
      const roles = this.roles();
      if (!this.groupMember && this.form.get("groupRoleId")?.value == null) {
        // A new member is a User, else whichever role the server marks as the default.
        const defaultRole =
          familyUserRole(roles, PermissionScope.Group) ??
          roles.find((role) => role.scope === PermissionScope.Group && role.isDefault);
        if (defaultRole) {
          this.form.get("groupRoleId")?.setValue(defaultRole.id);
        }
      }
    });
  }

  public ngOnInit(): void {
    this.form = buildGroupMemberForm(this.groupMember);
    this.setUsersToOmit();
    this.listenToGroupRoleChanges();
  }

  private listenToGroupRoleChanges(): void {
    const control = this.form.get("groupRoleId");
    control?.valueChanges
      .pipe(startWith(control.value), takeUntilDestroyed(this.destroyRef))
      .subscribe((id) =>
        this.selectedGroupRoleId.set(id == null ? null : Number(id))
      );
  }

  private setUsersToOmit(): void {
    const userId = this.authStore.userId();
    this.usersToOmit = [
      userId.toString(),
      ...this.currentGroupMembers.map((c) => c.userId.toString()),
    ];
  }

  public previewRole(): void {
    const role = this.selectedRole();
    if (role) {
      openRolePreviewDialog(this.dialog, role);
    }
  }

  public closeModal(): void {
    this.dialogRef.close();
  }

  public submit(): void {
    if (!this.form.valid) {
      return;
    }

    this.dialogRef.close(this.form);
  }
}
