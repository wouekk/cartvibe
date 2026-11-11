import { HttpErrorResponse } from "@angular/common/http";
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { HlmButton } from "@spartan-ng/helm/button";
import { Observable, take } from "rxjs";
import { CheckboxModule } from "../../checkbox/checkbox.module";
import { APP_DIALOG_DATA, AppDialogRef } from "../../dialog/app-dialog";
import { marker } from "../../i18n/marker";
import { TranslatePipe } from "../../i18n/translate.pipe";
import { InputModule } from "../../input";
import { OidcProviderService, OidcProviderView, UpsertOidcProviderCommand } from "../../open-api";
import { PipesModule } from "../../pipes";
import { SnackbarService } from "../../services";
import { AppIconComponent } from "../../shared-ui/icon/icon.component";
import { SharedUiModule } from "../../shared-ui/shared-ui.module";
import { trimmedRequiredValidator } from "../../validators";
import {
  issuerUrlValidator,
  openidScopeValidator,
  providerNameValidator,
  redirectUriFor,
  slugFromDisplayName,
} from "./oidc-provider.util";

export interface OidcProviderFormData {
  /** The provider to change; without one the dialog adds a provider. */
  provider?: OidcProviderView;
  /** System Settings' Server Public URL, for showing the redirect address before the provider exists. */
  serverPublicUrl?: string;
}

/**
 * Add or change a sign-in provider (System Settings → Sign-in providers). The secret never comes back from the
 * server, so on a change the field starts empty and an empty field keeps the stored one.
 */
@Component({
  selector: "app-oidc-provider-form",
  templateUrl: "./oidc-provider-form.component.html",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AppIconComponent,
    CheckboxModule,
    HlmButton,
    InputModule,
    PipesModule,
    ReactiveFormsModule,
    SharedUiModule,
    TranslatePipe,
  ],
})
export class OidcProviderFormComponent implements OnInit {
  private readonly data = inject<OidcProviderFormData | null>(APP_DIALOG_DATA, { optional: true }) ?? {};
  private readonly dialogRef = inject<AppDialogRef<OidcProviderFormComponent, boolean>>(AppDialogRef);
  private readonly formBuilder = inject(FormBuilder);
  private readonly oidcProviderService = inject(OidcProviderService);
  private readonly snackbarService = inject(SnackbarService);
  private readonly destroyRef = inject(DestroyRef);

  public readonly provider = this.data.provider;

  public readonly editing = !!this.provider;

  public form: FormGroup = new FormGroup({});

  public readonly nameHint = this.editing
    ? marker("Part of the redirect address, so it cannot be changed.")
    : marker("Lowercase letters, numbers and dashes. It is part of the redirect address and cannot be changed later.");

  public readonly secretHint = this.editing ? marker("Leave empty to keep the stored secret.") : "";

  /** True from the press on Save until the server answered, so a second press sends nothing. */
  public readonly saving = signal(false);

  /** The name as typed, for the redirect address shown while adding. */
  private readonly typedName = signal(this.provider?.name ?? "");

  /**
   * The address to register at the provider. A stored provider has the server's own; a new one gets it from the
   * Server Public URL and the name being typed, because the admin needs it at the provider before there is a
   * client id and secret to save here.
   */
  public readonly redirectUri = computed(
    () => this.provider?.redirectUri || redirectUriFor(this.data.serverPublicUrl, this.typedName())
  );

  public ngOnInit(): void {
    const provider = this.provider;
    this.form = this.formBuilder.group({
      displayName: [provider?.displayName ?? "", [trimmedRequiredValidator()]],
      name: [provider?.name ?? "", [trimmedRequiredValidator(), providerNameValidator()]],
      issuerUrl: [provider?.issuerUrl ?? "", [trimmedRequiredValidator(), issuerUrlValidator()]],
      clientId: [provider?.clientId ?? "", [trimmedRequiredValidator()]],
      // Never filled from the provider: the server does not send the secret back.
      clientSecret: ["", this.editing ? [] : [Validators.required]],
      scope: [provider?.scope ?? "openid profile email", [trimmedRequiredValidator(), openidScopeValidator()]],
      enabled: [provider?.enabled ?? true],
      allowProvisioning: [provider?.allowProvisioning ?? false],
      linkByUsername: [provider?.linkByUsername ?? false],
    });

    const name = this.form.get("name")!;
    if (this.editing) {
      // The name is in the redirect address registered at the provider; the server refuses a change too.
      name.disable();
      return;
    }

    name.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => this.typedName.set(String(value ?? "")));
    // Until the admin types a name of their own, it follows what they call the provider.
    this.form
      .get("displayName")!
      .valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((displayName) => {
        if (name.pristine) {
          name.setValue(slugFromDisplayName(String(displayName ?? "")));
        }
      });
  }

  public submit(): void {
    if (this.saving()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const command = this.buildCommand();
    const request: Observable<OidcProviderView> = this.provider
      ? this.oidcProviderService.updateOidcProvider(String(this.provider.id), command)
      : this.oidcProviderService.createOidcProvider(command);

    this.saving.set(true);
    request.pipe(take(1)).subscribe({
      next: () => {
        this.saving.set(false);
        this.snackbarService.success(this.editing ? marker("Sign-in provider saved") : marker("Sign-in provider added"));
        this.dialogRef.close(true);
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.reportRefusal(error);
      },
    });
  }

  public closeDialog(): void {
    this.dialogRef.close(false);
  }

  /**
   * Copies the redirect address. The clipboard is missing on a plain-http install, and this is the one text the
   * admin has to carry to the provider, so a failure says so instead of staying silent.
   */
  public async copyRedirectUri(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.redirectUri());
      this.snackbarService.success("Redirect address copied");
    } catch {
      this.snackbarService.error("Could not copy the address. Select it and copy it by hand.");
    }
  }

  private buildCommand(): UpsertOidcProviderCommand {
    const value = this.form.getRawValue();
    const command: UpsertOidcProviderCommand = {
      name: String(value.name ?? "").trim(),
      displayName: String(value.displayName ?? "").trim(),
      issuerUrl: String(value.issuerUrl ?? "").trim(),
      clientId: String(value.clientId ?? "").trim(),
      scope: String(value.scope ?? "").trim(),
      enabled: !!value.enabled,
      allowProvisioning: !!value.allowProvisioning,
      linkByUsername: !!value.linkByUsername,
    };

    // Leaving the key out is what tells the server to keep the stored secret.
    const secret = String(value.clientSecret ?? "").trim();
    if (secret) {
      command.clientSecret = secret;
    }
    return command;
  }

  /**
   * A refused save. The server answers a rule it checks itself with a map of field to text and no `errorMsg`, which
   * the error interceptor leaves alone, so it is said here; anything else the interceptor has already reported.
   */
  private reportRefusal(error: HttpErrorResponse): void {
    const fields = error.status === 400 && error.error && !error.error.errorMsg ? error.error : null;
    if (!fields) {
      return;
    }
    if (fields["enabled"]) {
      this.snackbarService.error(
        "Set the Server Public URL under Auth & Security first, or save the provider switched off."
      );
    } else if (fields["name"]) {
      this.snackbarService.error("A sign-in provider with that name already exists.");
    } else {
      this.snackbarService.error("The provider could not be saved. Check the fields and try again.");
    }
  }
}
