import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import { HlmButton } from "@spartan-ng/helm/button";
import { Store } from "@ngxs/store";
import { catchError, filter, of, switchMap, take } from "rxjs";
import { DEFAULT_DIALOG_CONFIG } from "../../constants";
import { AppDialog } from "../../dialog/app-dialog";
import { marker } from "../../i18n/marker";
import { TranslatePipe } from "../../i18n/translate.pipe";
import { TranslationService } from "../../i18n/translation.service";
import {
  FeatureConfigService,
  OidcProviderService,
  OidcProviderView,
  Permission,
  SortDirection,
  SystemSettingsService,
} from "../../open-api";
import { SnackbarService } from "../../services";
import { BadgeComponent } from "../../shared-ui/badge/badge.component";
import { ConfirmationDialogComponent } from "../../shared-ui/confirmation-dialog/confirmation-dialog.component";
import { AppIconComponent } from "../../shared-ui/icon/icon.component";
import { RowAction, RowActionsComponent } from "../../shared-ui/row-actions/row-actions.component";
import { SharedUiModule } from "../../shared-ui/shared-ui.module";
import { AuthState, SetFeatureConfig } from "../../store";
import { OidcProviderFormComponent, OidcProviderFormData } from "./oidc-provider-form.component";

/**
 * System Settings → Sign-in providers: the identity providers people may sign in with instead of a CartVibe
 * password (Authentik, Authelia, Keycloak, Google, any OpenID Connect provider). A household has a handful at
 * most, so the list is read whole and drawn as rows, with no paging or sorting.
 */
@Component({
  selector: "app-oidc-provider-list",
  templateUrl: "./oidc-provider-list.component.html",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "flex flex-col gap-4" },
  imports: [AppIconComponent, BadgeComponent, HlmButton, RouterLink, RowActionsComponent, SharedUiModule, TranslatePipe],
})
export class OidcProviderListComponent implements OnInit {
  private readonly dialog = inject(AppDialog);
  private readonly featureConfigService = inject(FeatureConfigService);
  private readonly oidcProviderService = inject(OidcProviderService);
  private readonly snackbarService = inject(SnackbarService);
  private readonly store = inject(Store);
  private readonly systemSettingsService = inject(SystemSettingsService);
  private readonly translation = inject(TranslationService);

  public readonly providers = signal<OidcProviderView[]>([]);

  /** Set after the first answer, so "none yet" never shows before the list has loaded. */
  public readonly loaded = signal(false);

  /** undefined until System Settings answered (or for someone who may not read them): then nothing is claimed. */
  public readonly serverPublicUrl = signal<string | undefined>(undefined);

  /** The address every provider sends people back to starts with the Server Public URL, so it comes first. */
  public readonly needsServerUrl = computed(() => this.serverPublicUrl() !== undefined && !this.serverPublicUrl()!.trim());

  public readonly canCreate = this.store.selectSignal(AuthState.hasAppPermission(Permission.AppOidcProvidersCreate));

  private readonly canUpdate = this.store.selectSignal(AuthState.hasAppPermission(Permission.AppOidcProvidersUpdate));

  private readonly canDelete = this.store.selectSignal(AuthState.hasAppPermission(Permission.AppOidcProvidersDelete));

  private readonly canReadSettings = this.store.selectSnapshot(
    AuthState.hasAppPermission(Permission.AppSystemSettingsRead)
  );

  public readonly rowActions: readonly RowAction<OidcProviderView>[] = [
    { key: "edit", label: marker("Edit"), icon: "edit", testId: "oidc-provider-edit", visible: () => this.canUpdate() },
    {
      key: "delete",
      label: marker("Delete"),
      icon: "delete",
      testId: "oidc-provider-delete",
      destructive: true,
      visible: () => this.canDelete(),
    },
  ];

  public ngOnInit(): void {
    this.loadProviders();
    if (this.canReadSettings) {
      this.systemSettingsService
        .getSystemSettings()
        .pipe(take(1), catchError(() => of(undefined)))
        .subscribe((settings) => this.serverPublicUrl.set(settings ? (settings.serverPublicUrl ?? "") : undefined));
    }
  }

  public rowAction(key: string, provider: OidcProviderView): void {
    if (key === "edit") {
      this.openForm(provider);
    } else if (key === "delete") {
      this.confirmDelete(provider);
    }
  }

  public openForm(provider?: OidcProviderView): void {
    const data: OidcProviderFormData = { provider, serverPublicUrl: this.serverPublicUrl() };
    this.dialog
      .open<OidcProviderFormComponent, OidcProviderFormData, boolean>(OidcProviderFormComponent, {
        ...DEFAULT_DIALOG_CONFIG,
        data,
      })
      .afterClosed()
      .pipe(take(1), filter((saved) => !!saved))
      .subscribe(() => this.afterChange());
  }

  private confirmDelete(provider: OidcProviderView): void {
    const ref = this.dialog.open(ConfirmationDialogComponent, DEFAULT_DIALOG_CONFIG);
    ref.componentInstance.headerText = this.translation.t("Delete {name}", { name: provider.displayName });
    ref.componentInstance.confirmText = marker("Delete");
    ref.componentInstance.dialogContent = this.translation.t(
      "Nobody will be able to sign in with {name} any more. An account that was created by it and has no password is locked out until an admin sets one.",
      { name: provider.displayName }
    );

    ref
      .afterClosed()
      .pipe(
        take(1),
        filter((confirmed) => !!confirmed),
        switchMap(() => this.oidcProviderService.deleteOidcProvider(String(provider.id)))
      )
      .subscribe({
        next: () => {
          this.snackbarService.success("Sign-in provider deleted");
          this.afterChange();
        },
        // The interceptor has said what went wrong; the list stays as it is.
        error: () => undefined,
      });
  }

  /**
   * After an add, change or delete: the list again, and the feature config, which holds the providers the login
   * page and User Settings offer (it is otherwise read at sign-in).
   */
  private afterChange(): void {
    this.loadProviders();
    this.featureConfigService
      .getFeatureConfig()
      .pipe(
        take(1),
        switchMap((config) => this.store.dispatch(new SetFeatureConfig(config))),
        catchError(() => of(undefined))
      )
      .subscribe();
  }

  private loadProviders(): void {
    this.oidcProviderService
      .getPagedOidcProviders({ page: 1, pageSize: -1, orderBy: "name", sortDirection: SortDirection.Asc })
      .pipe(take(1))
      .subscribe({
        next: (paged) => {
          // The paged answer is typed as the union of every list in the app, which does not name a provider.
          this.providers.set((paged.data ?? []) as unknown as OidcProviderView[]);
          this.loaded.set(true);
        },
        error: () => this.loaded.set(true),
      });
  }
}
