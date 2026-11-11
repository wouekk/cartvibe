import { Component, DestroyRef, Input, OnInit, computed, effect, inject, signal, ChangeDetectionStrategy } from "@angular/core";
import { takeUntilDestroyed, toSignal } from "@angular/core/rxjs-interop";
import { FormBuilder, FormControl, FormGroup, Validators, ReactiveFormsModule } from "@angular/forms";
import { AppDialog, AppDialogRef } from "../../dialog/app-dialog";
import { Store } from "@ngxs/store";
import { catchError, defer, iif, of, startWith, switchMap, take, tap, } from "rxjs";
import { UserValidators } from "src/validators/user-validators";
import { FormMode } from "src/enums/form-mode.enum";
import {
  PermissionScope,
  Role,
  RoleService,
  User,
  UserService,
} from "../../open-api";
import { familyRoleOptions, familyUserRole } from "../../utils/family-roles";
import { openRolePreviewDialog } from "../../roles/role-preview/role-preview-dialog.component";
import { SnackbarService, TokenRefreshService } from "../../services";
import { AddUser, AuthState, UpdateUser } from "../../store";
import { FormSectionComponent } from "../../shared-ui/form-section/form-section.component";
import { InputComponent } from "../../input/input/input.component";
import { NgIf } from "@angular/common";
import { SelectComponent } from "../../select/select/select.component";
import { ButtonComponent } from "../../button/button/button.component";
import { CheckboxComponent } from "../../checkbox/checkbox/checkbox.component";
import { CancelButtonComponent } from "../../shared-ui/cancel-button/cancel-button.component";
import { SubmitButtonComponent } from "../../shared-ui/submit-button/submit-button.component";
import { TranslatePipe } from "../../i18n/translate.pipe";
import { FormGetPipe } from "../../pipes/form-get.pipe";

@Component({
    selector: "app-user-form",
    host: { class: "block max-h-[85vh] overflow-y-auto" },
    templateUrl: "./user-form.component.html",
    providers: [UserValidators],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [ReactiveFormsModule, FormSectionComponent, InputComponent, NgIf, SelectComponent, ButtonComponent, CheckboxComponent, CancelButtonComponent, SubmitButtonComponent, TranslatePipe, FormGetPipe]
})
export class UserFormComponent implements OnInit {
  @Input() public user?: User;

  /** Editing an existing user dims Save until something changes. */
  public get submitMode(): FormMode {
    return this.user ? FormMode.edit : FormMode.add;
  }

  public isDummerUserHelpText: string =
    "A dummy user is a user who cannot log in, but can still act as a receipt payer, or be charged shares. Dummy users can be converted to normal users, but normal users cannot be converted to dummy users.";

  constructor(
    private formBuilder: FormBuilder,
    private snackbarService: SnackbarService,
    private store: Store,
    private tokenRefreshService: TokenRefreshService,
    private userService: UserService,
    private userValidators: UserValidators,
    private matDialog: AppDialog,
    private destroyRef: DestroyRef,
    public matDialogRef: AppDialogRef<UserFormComponent>
  ) {
    // Pre-select the User role on the add form once the roles resolve. Syncing a
    // derived value into the reactive form is an imperative side effect, so an
    // effect() is the sanctioned tool here.
    effect(() => {
      const roles = this.roles();
      if (!this.user && this.form.get("appRoleId")?.value == null) {
        // A new account is a User, else whichever role the server marks as the default.
        const defaultRole =
          familyUserRole(roles, PermissionScope.App) ??
          roles.find((role) => role.scope === PermissionScope.App && role.isDefault);
        if (defaultRole) {
          this.form.get("appRoleId")?.setValue(defaultRole.id);
        }
      }
    });
  }

  public form: FormGroup = new FormGroup({});

  // The full app-role list, the selector options and the currently-selected role
  // (for the preview button) are derived reactively so they update once the roles
  // load asynchronously. Degrade gracefully if the roles can't be read: the
  // selector is simply empty rather than erroring.
  private readonly roles = toSignal(
    inject(RoleService)
      .getRoles()
      .pipe(catchError(() => of([] as Role[]))),
    { initialValue: [] as Role[] }
  );
  private readonly selectedAppRoleId = signal<number | null>(null);
  // The two app roles: Admin and User.
  public readonly appRoleOptions = computed<Role[]>(() =>
    familyRoleOptions(this.roles(), PermissionScope.App)
  );
  // The role itself, not its relabelled option, so the preview shows its real name.
  public readonly selectedRole = computed<Role | null>(
    () =>
      this.roles().find(
        (role) => role.scope === PermissionScope.App && role.id === this.selectedAppRoleId()
      ) ?? null
  );

  public ngOnInit(): void {
    this.initForm();
    this.listenToAppRoleChanges();
    if (!this.user) {
      this.listenToIsDummyChanges();
    }
  }

  private listenToAppRoleChanges(): void {
    const control = this.form.get("appRoleId");
    control?.valueChanges
      .pipe(startWith(control.value), takeUntilDestroyed(this.destroyRef))
      .subscribe((id) =>
        this.selectedAppRoleId.set(id == null ? null : Number(id))
      );
  }

  private listenToIsDummyChanges(): void {
    this.form
      .get("isDummyUser")
      ?.valueChanges.pipe(
      startWith(this.form.get("isDummyUser")?.value),
      tap((isDummyUser: boolean) => {
        const passwordField = this.form.get("password");
        if (isDummyUser) {
          passwordField?.removeValidators(Validators.required);
          passwordField?.setValue("");
          passwordField?.disable();
        } else {
          passwordField?.setValue("");
          passwordField?.enable();
          passwordField?.addValidators(Validators.required);
        }
      })
    )
      .subscribe();
  }

  private initForm(): void {
    this.form = this.formBuilder.group({
      displayName: [this.user?.displayName ?? "", Validators.required],
      username: [
        this.user?.username ?? "",
        Validators.required,
        this.userValidators.uniqueUsername(0, this.user?.username ?? ""),
      ],
      appRoleId: [this.user?.appRoleId ?? null, Validators.required],
      isDummyUser: [false],
    });

    if (!this.user) {
      this.form.addControl(
        "password",
        new FormControl("", Validators.required)
      );
    } else {
      this.form.get("isDummyUser")?.disable();
    }
  }

  public previewRole(): void {
    const role = this.selectedRole();
    if (role) {
      openRolePreviewDialog(this.matDialog, role);
    }
  }

  public submit(): void {
    if (this.form.valid && this.user) {
      this.userService
        .updateUserById(this.user.id, this.form.value)
        .pipe(
          take(1),
          switchMap(() =>
            this.store.dispatch(
              new UpdateUser(this.user?.id.toString() as string, {
                ...this.user,
                ...this.form.value,
              })
            )
          ),
          // Ahead of the token refresh below, which is session housekeeping
          // rather than something this message speaks for.
          tap(() => {
            this.snackbarService.success("User successfully updated");
          }),
          switchMap(() =>
            iif(
              () =>
                this.store.selectSnapshot(AuthState.loggedInUser).id ===
                this.user?.id,
              defer(() => this.tokenRefreshService.refreshToken()),
              of(undefined)
            )
          ),
          tap(() => this.matDialogRef.close(true)),
          catchError(() => {
            // The interceptor surfaces the failure; keep the dialog open so the
            // admin can correct the input rather than losing it.
            return of(undefined);
          })
        )
        .subscribe();
    } else if (this.form.valid && !this.user) {
      this.userService
        .createUser(this.form.value)
        .pipe(
          take(1),
          switchMap((u) => this.store.dispatch(new AddUser(u))),
          tap(() => {
            this.snackbarService.success("User successfully created");
            this.matDialogRef.close(true);
          }),
          catchError((err) => {
            // Closing here would report a create that never happened and discard
            // what the admin typed, so the dialog stays open. The username
            // conflict comes back as a field message the interceptor ignores, so
            // it is surfaced here; anything else it already toasted itself.
            const message = err?.error?.["username"] ?? err?.["errMsg"];
            if (message) {
              this.snackbarService.error(message);
            }
            return of(undefined);
          })
        )
        .subscribe();
    }
  }

  public closeModal(): void {
    this.matDialogRef.close(false);
  }
}
