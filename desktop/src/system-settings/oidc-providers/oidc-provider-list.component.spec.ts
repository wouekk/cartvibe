import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { NgxsModule, Store } from "@ngxs/store";
import { of, throwError } from "rxjs";
import { AppDialog } from "../../dialog/app-dialog";
import {
  FeatureConfigService,
  OidcProviderService,
  OidcProviderView,
  Permission,
  SystemSettingsService,
} from "../../open-api";
import { SnackbarService } from "../../services";
import { ConfirmationDialogComponent } from "../../shared-ui/confirmation-dialog/confirmation-dialog.component";
import { AuthState } from "../../store";
import { SetPermissions } from "../../store/auth.state.actions";
import { OidcProviderFormComponent } from "./oidc-provider-form.component";
import { OidcProviderListComponent } from "./oidc-provider-list.component";
import { FeatureConfigStore } from "../../store/feature-config.store";

import type { Mock } from "vitest";

const provider = (overrides: Partial<OidcProviderView> = {}): OidcProviderView => ({
  id: 7,
  name: "authentik",
  displayName: "Authentik",
  issuerUrl: "https://auth.example.com/application/o/cartvibe/",
  clientId: "cartvibe",
  scope: "openid profile email",
  allowProvisioning: false,
  linkByUsername: false,
  enabled: true,
  hasClientSecret: true,
  redirectUri: "https://receipts.example.com/api/oidc/authentik/callback",
  ...overrides,
});

const ADMIN = [
  Permission.AppSystemSettingsRead,
  Permission.AppOidcProvidersRead,
  Permission.AppOidcProvidersCreate,
  Permission.AppOidcProvidersUpdate,
  Permission.AppOidcProvidersDelete,
];

describe("OidcProviderListComponent", () => {
  let fixture: ComponentFixture<OidcProviderListComponent>;
  let component: OidcProviderListComponent;
  let providers: { getPagedOidcProviders: Mock; deleteOidcProvider: Mock };
  let settings: { getSystemSettings: Mock };
  let featureConfig: { getFeatureConfig: Mock };
  let snackbar: { success: Mock; error: Mock };
  let dialog: { open: Mock };
  let closeWith: unknown;

  const setUp = async (
    rows: OidcProviderView[],
    { permissions = ADMIN, serverPublicUrl = "https://receipts.example.com" as string | undefined, listFails = false } = {}
  ): Promise<void> => {
    providers = {
      getPagedOidcProviders: vi.fn(() =>
        listFails ? throwError(() => new Error("offline")) : of({ data: rows, totalCount: rows.length })
      ),
      deleteOidcProvider: vi.fn(() => of(undefined)),
    };
    settings = { getSystemSettings: vi.fn(() => of({ serverPublicUrl })) };
    featureConfig = {
      getFeatureConfig: vi.fn(() =>
        of({ enableLocalSignUp: false, aiPoweredReceipts: false, oidcProviders: [{ name: "authentik", displayName: "Authentik" }] })
      ),
    };
    snackbar = { success: vi.fn(), error: vi.fn() };
    closeWith = false;
    dialog = { open: vi.fn(() => ({ afterClosed: () => of(closeWith), componentInstance: {} })) };

    await TestBed.configureTestingModule({
      imports: [OidcProviderListComponent, NgxsModule.forRoot([AuthState])],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: OidcProviderService, useValue: providers },
        { provide: SystemSettingsService, useValue: settings },
        { provide: FeatureConfigService, useValue: featureConfig },
        { provide: SnackbarService, useValue: snackbar },
        { provide: AppDialog, useValue: dialog },
      ],
    }).compileComponents();

    TestBed.inject(Store).dispatch(new SetPermissions(permissions, {}));
    fixture = TestBed.createComponent(OidcProviderListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  };

  const element = (testId: string) => fixture.nativeElement.querySelector(`[data-testid=${testId}]`) as HTMLElement | null;
  const rowTexts = () =>
    Array.from(fixture.nativeElement.querySelectorAll("[data-testid=oidc-provider-row]")).map((row) =>
      (row as HTMLElement).textContent?.replace(/\s+/g, " ").trim()
    );

  it("reads every provider in one request, by name", async () => {
    await setUp([provider()]);

    expect(providers.getPagedOidcProviders).toHaveBeenCalledWith({ page: 1, pageSize: -1, orderBy: "name", sortDirection: "asc" });
  });

  it("lists each provider with its address and whether it is switched on", async () => {
    await setUp([provider(), provider({ id: 8, name: "keycloak", displayName: "Keycloak", issuerUrl: "https://kc.example.com/realms/home", enabled: false })]);

    const rows = rowTexts();
    expect(rows.length).toBe(2);
    expect(rows[0]).toMatch(/^Authentik\s*Switched on\s*https:\/\/auth\.example\.com\/application\/o\/cartvibe\/$/);
    expect(rows[1]).toMatch(/^Keycloak\s*Switched off\s*https:\/\/kc\.example\.com\/realms\/home$/);
    expect(element("oidc-providers-empty")).toBeNull();
  });

  it("says that everyone signs in with a password while there is no provider", async () => {
    await setUp([]);

    expect(element("oidc-providers-empty")?.textContent).toContain("No sign-in provider yet");
    expect(element("oidc-provider-rows")).toBeNull();
  });

  it("points at the Server Public URL while it is not set", async () => {
    await setUp([], { serverPublicUrl: "" });

    const warning = element("oidc-server-url-missing");
    expect(warning?.textContent).toContain("Server Public URL");
    expect(warning?.querySelector("a")?.getAttribute("href")).toBe("/system-settings/security");
  });

  it("claims nothing about the Server Public URL when it is set, or cannot be read", async () => {
    await setUp([]);
    expect(element("oidc-server-url-missing")).toBeNull();

    TestBed.resetTestingModule();
    await setUp([], { permissions: [Permission.AppOidcProvidersRead] });

    expect(settings.getSystemSettings).not.toHaveBeenCalled();
    expect(element("oidc-server-url-missing")).toBeNull();
  });

  it("offers Add, Edit and Delete only to who may", async () => {
    await setUp([provider()], { permissions: [Permission.AppOidcProvidersRead] });

    expect(element("oidc-provider-add")).toBeNull();
    expect(element("oidc-provider-edit")).toBeNull();
    expect(element("oidc-provider-delete")).toBeNull();

    TestBed.resetTestingModule();
    await setUp([provider()]);

    expect(element("oidc-provider-add")).not.toBeNull();
    expect(element("oidc-provider-edit")).not.toBeNull();
    expect(element("oidc-provider-delete")).not.toBeNull();
  });

  it("opens the form with the Server Public URL for a new provider, and reloads after a save", async () => {
    await setUp([]);
    closeWith = true;

    element("oidc-provider-add")!.click();

    expect(dialog.open).toHaveBeenCalledWith(
      OidcProviderFormComponent,
      expect.objectContaining({ data: { provider: undefined, serverPublicUrl: "https://receipts.example.com" } })
    );
    expect(providers.getPagedOidcProviders).toHaveBeenCalledTimes(2);
    // The login page and User Settings read the providers from the feature config.
    expect(TestBed.inject(FeatureConfigStore).oidcProviders()).toEqual([
      { name: "authentik", displayName: "Authentik" },
    ]);
  });

  it("opens the form with the provider to change, and leaves the list alone when it is cancelled", async () => {
    const row = provider();
    await setUp([row]);

    component.rowAction("edit", row);

    expect(dialog.open.mock.calls[0][1].data.provider).toBe(row);
    expect(providers.getPagedOidcProviders).toHaveBeenCalledTimes(1);
    expect(featureConfig.getFeatureConfig).not.toHaveBeenCalled();
  });

  it("deletes after a confirmation that says who is locked out", async () => {
    const row = provider();
    await setUp([row]);
    closeWith = true;
    const confirmation = { afterClosed: () => of(true), componentInstance: {} as Record<string, string> };
    dialog.open.mockReturnValue(confirmation);

    component.rowAction("delete", row);

    expect(dialog.open.mock.calls[0][0]).toBe(ConfirmationDialogComponent);
    expect(confirmation.componentInstance["confirmText"]).toBe("Delete");
    expect(confirmation.componentInstance["dialogContent"]).toContain("Authentik");
    expect(confirmation.componentInstance["dialogContent"]).toContain("locked out");
    expect(providers.deleteOidcProvider).toHaveBeenCalledWith("7");
    expect(snackbar.success).toHaveBeenCalledWith("Sign-in provider deleted");
    expect(providers.getPagedOidcProviders).toHaveBeenCalledTimes(2);
  });

  it("deletes nothing when the confirmation is dismissed", async () => {
    const row = provider();
    await setUp([row]);

    component.rowAction("delete", row);

    expect(providers.deleteOidcProvider).not.toHaveBeenCalled();
  });

  it("keeps the list when the delete fails", async () => {
    const row = provider();
    await setUp([row]);
    dialog.open.mockReturnValue({ afterClosed: () => of(true), componentInstance: {} });
    providers.deleteOidcProvider.mockReturnValue(throwError(() => new Error("offline")));

    component.rowAction("delete", row);

    expect(snackbar.success).not.toHaveBeenCalled();
    expect(providers.getPagedOidcProviders).toHaveBeenCalledTimes(1);
    expect(component.providers()).toEqual([row]);
  });

  it("counts a list that could not be read as loaded, so the page does not wait for ever", async () => {
    await setUp([], { listFails: true });

    expect(component.loaded()).toBe(true);
    expect(component.providers()).toEqual([]);
  });
});
