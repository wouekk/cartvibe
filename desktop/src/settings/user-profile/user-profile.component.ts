import { HttpErrorResponse } from "@angular/common/http";
import {Component, computed, inject, OnInit, signal, ChangeDetectionStrategy} from "@angular/core";
import {FormBuilder, FormGroup, Validators} from "@angular/forms";
import { AppDialog, AppDialogConfig } from "../../dialog/app-dialog";
import {ActivatedRoute, Router} from "@angular/router";
import {catchError, filter, Observable, of, switchMap, take, tap} from "rxjs";
import {DEFAULT_DIALOG_CONFIG} from "src/constants/dialog.constant";
import {FormMode} from "src/enums/form-mode.enum";
import {FormConfig} from "src/interfaces";
import {
  AuthService,
  DeleteAccountCommand,
  OidcConnectionView,
  OidcProviderSummary,
  OidcService,
  Permission,
  User,
  UserService,
} from "../../open-api";
import { ConfirmationDialogComponent } from "../../shared-ui/confirmation-dialog/confirmation-dialog.component";
import {ClaimsService, SnackbarService, TokenRefreshService} from "../../services";
import { AuthStore, FeatureConfigStore, UserStore } from "../../store";
import { TranslationService } from "../../i18n/translation.service";
import { buildOidcLinkUrl, oidcErrorMessage } from "../../utils/oidc";
import {
  DeleteAccountDialogComponent,
  DeleteAccountDialogData,
  DeleteAccountDialogResult,
} from "../delete-account-dialog/delete-account-dialog.component";
import { marker } from "../../i18n/marker";
import { GROUP_COLORS } from "../../constants/group-look";
import { ColorSwatch, ColorSwatchesComponent } from "../../shared-ui/color-swatches/color-swatches.component";
import { AvatarPhotoComponent } from "../avatar-photo/avatar-photo.component";
import { FormComponent } from "../../shared-ui/form/form.component";
import { FormSectionComponent } from "../../shared-ui/form-section/form-section.component";
import { InputComponent } from "../../input/input/input.component";
import { BrnTooltip } from "@spartan-ng/brain/tooltip";
import { HlmTooltip } from "../../ui/tooltip/lib/hlm-tooltip";
import { SettingsSectionComponent } from "../../shared-ui/settings/settings-section.component";
import { BrnButton } from "@spartan-ng/brain/button";
import { HlmButton } from "../../ui/button/lib/hlm-button";
import { AppIconComponent } from "../../shared-ui/icon/icon.component";
import { HasAppPermissionDirective } from "../../directives/has-app-permission.directive";
import { TranslatePipe } from "../../i18n/translate.pipe";
import { FormGetPipe } from "../../pipes/form-get.pipe";
import { InputReadonlyPipe } from "../../pipes/input-readonly.pipe";

/** The household colours as avatar swatches: the same menu, stored as hex (the token keeps a hex colour). */
const AVATAR_SWATCHES: readonly ColorSwatch[] = GROUP_COLORS.map((color) => ({
  value: color.hex,
  name: color.key,
  label: color.label,
  background: color.hex,
  foreground: "#ffffff",
}));

@Component({
    selector: "app-user-profile",
    templateUrl: "./user-profile.component.html",
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [AvatarPhotoComponent, FormComponent, FormSectionComponent, InputComponent, BrnTooltip, HlmTooltip, ColorSwatchesComponent, SettingsSectionComponent, BrnButton, HlmButton, AppIconComponent, HasAppPermissionDirective, TranslatePipe, FormGetPipe, InputReadonlyPipe]
})
export class UserProfileComponent implements OnInit {
  private readonly authStore = inject(AuthStore);

  private readonly userStore = inject(UserStore);

  private readonly featureConfigStore = inject(FeatureConfigStore);


  public form: FormGroup = new FormGroup({});

  public user!: User;

  public formConfig!: FormConfig;

  public formMode = FormMode;

  public usernameTooltip: string =
    marker("Only an admin can change your username.");

  protected readonly Permission = Permission;

  protected readonly canEdit = computed(() => this.authStore.hasAppPermission(Permission.AppAccountUpdate));

  /**
   * The identity providers connected to this account, loaded on init: the Sign-in methods card lists them, and they
   * decide how Delete Account confirms.
   */
  public readonly connections = signal<OidcConnectionView[]>([]);

  /** The providers an admin switched on (the login page's buttons). */
  private readonly providers = this.featureConfigStore.oidcProviders;

  /** Switched-on providers this account is not connected to yet. */
  public readonly availableProviders = computed(() =>
    this.providers().filter((provider) => !this.connections().some((c) => c.providerName === provider.name))
  );

  /** The card is for installs that use a provider: without one, and without a connection, there is nothing to say. */
  public readonly showSignInMethods = computed(() => this.connections().length > 0 || this.providers().length > 0);

  /**
   * An account created by a provider has no password of its own, so it confirms
   * a self-delete by signing in at one of its providers again. Every connection
   * of such an account carries the flag. A failed load leaves the list empty,
   * which falls back to the password dialog -- the behaviour before this existed.
   */
  public readonly isPasswordless = computed(() =>
    this.connections().some((c) => c.provisionedUser)
  );

  constructor(
    private claimsService: ClaimsService,
    private formBuilder: FormBuilder,
    private dialog: AppDialog,
    private route: ActivatedRoute,
    private router: Router,
    private snackbarService: SnackbarService,
    private oidcService: OidcService,
    private tokenRefreshService: TokenRefreshService,
    private userService: UserService
  ) {
  }

  public ngOnInit(): void {
    this.user = this.authStore.loggedInUser();
    this.formConfig = this.editableConfig(this.route?.snapshot?.data?.["formConfig"], this.canEdit());
    this.initForm();
    this.loadConnections();
    this.completeDeleteConfirmation();
    this.reportConnectResult();
  }

  /**
   * The last connection of an account that a provider created cannot go: the account has no password, so nothing
   * would be left to sign in with. The server refuses it too.
   */
  public canDisconnect(connection: OidcConnectionView): boolean {
    return !(connection.provisionedUser && this.connections().length === 1);
  }

  /**
   * Connects a provider to this account by opening the server's address as a page; the session proves who is
   * asking, so nothing is matched by name. The provider sends the browser back here with the result.
   */
  public connectProvider(provider: OidcProviderSummary): void {
    this.navigateToUrl(buildOidcLinkUrl(provider.name));
  }

  public disconnectProvider(connection: OidcConnectionView): void {
    const ref = this.dialog.open(ConfirmationDialogComponent);
    ref.componentInstance.headerText = marker("Disconnect the provider");
    ref.componentInstance.dialogContent = this.translation.t(
      "You will no longer be able to sign in with {name}. Your account and everything in it stay.",
      { name: connection.providerDisplayName }
    );
    ref.componentInstance.confirmText = marker("Remove");

    ref
      .afterClosed()
      .pipe(
        take(1),
        filter((confirmed) => !!confirmed),
        switchMap(() => this.oidcService.deleteOidcConnection(connection.providerName)),
      )
      .subscribe({
        next: () => {
          this.snackbarService.success("Provider disconnected");
          this.loadConnections();
        },
        error: (error: HttpErrorResponse) => {
          // A refusal the server explains per field carries no errorMsg, so the interceptor stayed silent.
          if (error.status === 400 && !error.error?.errorMsg) {
            this.snackbarService.error("This provider is the only way into your account, so it cannot be disconnected.");
          }
        },
      });
  }

  /**
   * Says how a connect attempt ended (the server sends the browser back with `oidcLinked` or `oidcError`), then
   * takes the parameter out of the address so a reload does not say it again.
   */
  private reportConnectResult(): void {
    const params = this.route?.snapshot?.queryParams ?? {};
    const linked = params["oidcLinked"];
    const errorCode = params["oidcError"];
    if (!linked && !errorCode) {
      return;
    }

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { oidcLinked: null, oidcError: null },
      queryParamsHandling: "merge",
      replaceUrl: true,
    });

    if (linked) {
      this.snackbarService.success("Provider connected. You can sign in with it from now on.");
    } else {
      this.snackbarService.error(oidcErrorMessage(errorCode));
    }
  }

  /** The avatar colour on file (a hex), as the form holds it. */
  public avatarColor(): string {
    return this.form.get("defaultAvatarColor")?.value ?? "";
  }

  /**
   * The household colour menu as avatar colours (each a deep hex under the white initial). A colour picked before the
   * menu existed, or the default one, leads the grid as "Current colour" so it stays visible and pressed. It follows
   * the saved colour, not the pick, so the grid does not shift under the finger.
   */
  public avatarSwatches(): readonly ColorSwatch[] {
    const current = this.user?.defaultAvatarColor ?? "";
    if (!current || AVATAR_SWATCHES.some((swatch) => swatch.value.toLowerCase() === current.toLowerCase())) {
      return AVATAR_SWATCHES;
    }
    if (this.customSwatches?.[0].value !== current) {
      this.customSwatches = [
        { value: current, name: "current", label: marker("Current colour"), background: current, foreground: "#ffffff" },
        ...AVATAR_SWATCHES,
      ];
    }
    return this.customSwatches;
  }

  private customSwatches?: readonly ColorSwatch[];

  public pickAvatarColor(hex: string): void {
    const control = this.form.get("defaultAvatarColor");
    control?.setValue(hex);
    control?.markAsDirty();
  }

  /** Seam for the full-page navigation, so a spec can assert where it goes. */
  protected navigateToUrl(url: string): void {
    window.location.href = url;
  }

  private loadConnections(): void {
    this.oidcService
      .getOidcConnections()
      .pipe(
        take(1),
        tap((connections) => this.connections.set(connections ?? [])),
        // A user without the account-read permission, or an older server, simply
        // gets no section rather than an error.
        catchError(() => of(undefined)),
      )
      .subscribe();
  }

  /**
   * Finishes a provider-confirmed account deletion the backend redirected back
   * from. The parameters are stripped from the address bar first, so a reload
   * cannot resubmit a spent code or repeat a stale error.
   */
  private completeDeleteConfirmation(): void {
    const params = this.route?.snapshot?.queryParams ?? {};
    const confirmationCode = params["deleteConfirmation"];
    const errorCode = params["deleteError"];

    if (!confirmationCode && !errorCode) {
      return;
    }

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { deleteConfirmation: null, deleteError: null },
      queryParamsHandling: "merge",
      replaceUrl: true,
    });

    if (confirmationCode) {
      this.deleteAccountAndSignOut({ confirmationCode })
        .pipe(
          take(1),
          // A spent or expired code is a 400; the interceptor already reported it.
          catchError(() => of(undefined)),
        )
        .subscribe();
      return;
    }

    // Own-property check, not a bare lookup: the query param is whatever the
    // address bar holds, and an inherited key like "constructor" would resolve
    // to a function.
    this.snackbarService.error(
      Object.hasOwn(DELETE_CONFIRMATION_ERROR_MESSAGES, errorCode)
        ? DELETE_CONFIRMATION_ERROR_MESSAGES[errorCode]
        : DELETE_CONFIRMATION_ERROR_MESSAGES["default"]
    );
  }

  private initForm(): void {
    this.form = this.formBuilder.group({
      username: this.user?.username ?? "",
      displayName: [this.user?.displayName ?? "", Validators.required],
      defaultAvatarColor: [
        this.user?.defaultAvatarColor ?? "",
        Validators.pattern("^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$"),
      ],
    });

    if (this.formConfig.mode === FormMode.edit) {
      this.form.get("username")?.disable();
    }
  }

  /**
   * User settings are always editable (Save in the card footer, like System Settings): a view route turns into the
   * edit form for anyone who may update, so there is no pencil to press first.
   */
  private editableConfig(config: FormConfig, canEdit: boolean): FormConfig {
    return config?.mode === FormMode.view && canEdit ? { ...config, mode: FormMode.edit } : config;
  }

  public submit(): void {
    if (this.form.valid) {
      this.userService
        .updateUserProfile(this.form.value)
        .pipe(
          take(1),
          switchMap(() => this.tokenRefreshService.refreshToken()),
          switchMap(() => this.claimsService.getAndSetClaimsForLoggedInUser()),
          tap(() => {
            const loggedInUser = this.authStore.loggedInUser();
            this.userStore.updateUser(loggedInUser.id.toString(), loggedInUser);
          }),
          tap(() => {
            this.snackbarService.success("User profile successfully updated");
            this.form.markAsPristine();
          })
        )
        .subscribe();
    }
  }

  public deleteAccount(): void {
    const dialogRef = this.dialog.open<
      DeleteAccountDialogComponent,
      DeleteAccountDialogData,
      DeleteAccountDialogResult
    >(DeleteAccountDialogComponent, this.deleteAccountDialogConfig());

    dialogRef
      .afterClosed()
      .pipe(
        take(1),
        switchMap((result) => {
          if (result && "providerName" in result) {
            // The provider sends the browser back here with a single-use code,
            // which completeDeleteConfirmation() then spends.
            this.navigateToUrl(buildOidcDeleteConfirmationUrl(result.providerName));
            return of(undefined);
          }

          if (result && "password" in result) {
            return this.deleteAccountAndSignOut({ password: result.password }).pipe(
              catchError((err) => {
                if (err.status === 401) {
                  this.deleteAccount();
                }
                return of(undefined);
              })
            );
          }
          return of(undefined);
        })
      )
      .subscribe();
  }

  /**
   * A passwordless account gets one confirm button per connected provider;
   * every other account gets the password form.
   */
  private deleteAccountDialogConfig(): AppDialogConfig<DeleteAccountDialogData> {
    if (!this.isPasswordless()) {
      return DEFAULT_DIALOG_CONFIG;
    }

    return {
      ...DEFAULT_DIALOG_CONFIG,
      data: {
        providers: this.connections().map((c) => ({
          name: c.providerName,
          displayName: c.providerDisplayName,
        })),
      },
    };
  }

  private readonly authService = inject(AuthService);

  private readonly translation = inject(TranslationService);

  /** True from the confirmation until the server answered, so the button cannot fire twice. */
  public readonly signingOutEverywhere = signal(false);

  /**
   * Ends every session of this account (each browser, each connected assistant) after a confirmation, then signs
   * this browser out like signing out does. The server cannot be skipped here: without its answer the other devices
   * would stay signed in, so a failure leaves this browser signed in too (the interceptor says what went wrong).
   */
  public signOutEverywhere(): void {
    const ref = this.dialog.open(ConfirmationDialogComponent);
    ref.componentInstance.headerText = marker("Sign out everywhere");
    ref.componentInstance.dialogContent = marker(
      "You will be signed out on every device, this one included, and connected assistants will have to connect again. Continue?"
    );
    ref.componentInstance.confirmText = marker("Sign out");

    ref
      .afterClosed()
      .pipe(
        take(1),
        filter((confirmed) => !!confirmed),
        tap(() => this.signingOutEverywhere.set(true)),
        switchMap(() => this.authService.signOutEverywhere()),
        tap(() => this.authStore.logout()),
      )
      .subscribe({
        next: () => {
          this.signingOutEverywhere.set(false);
          void this.router.navigate(["/"]);
        },
        error: () => this.signingOutEverywhere.set(false),
      });
  }

  private deleteAccountAndSignOut(command: DeleteAccountCommand): Observable<void> {
    return this.userService.deleteAccount(command).pipe(
      tap(() => this.authStore.logout()),
      tap(() => {
        this.snackbarService.success(
          "Your account has been successfully deleted"
        );
        this.router.navigate(["/"]);
      }),
    );
  }
}

/**
 * Builds the URL that starts a provider-confirmed account deletion. Pure, so it
 * can be asserted directly.
 */
export function buildOidcDeleteConfirmationUrl(providerName: string): string {
  return `/api/oidc/connections/${encodeURIComponent(providerName)}/delete-confirmation`;
}

/**
 * Copy for the error codes a delete confirmation can redirect back with, keyed
 * by the backend's fixed vocabulary so an unknown code still gets a message.
 */
const DELETE_CONFIRMATION_ERROR_MESSAGES: Record<string, string> = {
  identity_mismatch:
    marker("You signed in with a different account than the one connected here."),
  stale_login:
    marker("Your provider didn't ask you to sign in again. Sign out of it and try again."),
  not_linked: marker("That provider is no longer connected to your account."),
  forbidden: marker("Your account can't be deleted this way."),
  default: marker("Could not confirm the account deletion. Please try again."),
};
