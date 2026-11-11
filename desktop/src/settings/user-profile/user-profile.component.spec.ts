import { GROUP_COLORS } from "../../constants/group-look";
import { ColorSwatchesComponent } from "../../shared-ui/color-swatches/color-swatches.component";
import { HttpErrorResponse, provideHttpClient, withInterceptorsFromDi } from "@angular/common/http";
import { CUSTOM_ELEMENTS_SCHEMA } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ReactiveFormsModule } from "@angular/forms";
import { AppDialog, AppDialogRef } from "../../dialog/app-dialog";
import { ActivatedRoute, Router } from "@angular/router";
import { NgxsModule, Store } from "@ngxs/store";
import { firstValueFrom, of, throwError } from "rxjs";
import { ApiModule, AuthService, OidcConnectionView, OidcService, Permission, UserService } from "../../open-api";
import { SnackbarService, TokenRefreshService } from "../../services";
import { AuthStore, FeatureConfigStore, UserStore } from "../../store";
import { buildOidcDeleteConfirmationUrl, UserProfileComponent } from "./user-profile.component";
import { DeleteAccountDialogComponent } from "../delete-account-dialog/delete-account-dialog.component";
import { seedStore } from "../../testing/seed-store";

import type { Mock } from "vitest";
function connection(overrides: Partial<OidcConnectionView> = {}): OidcConnectionView {
  return {
    providerName: "google",
    providerDisplayName: "Google",
    provisionedUser: true,
    linkedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("UserProfileComponent", () => {
  let component: UserProfileComponent;
  let fixture: ComponentFixture<UserProfileComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    imports: [ApiModule,
        ColorSwatchesComponent,
        NgxsModule.forRoot([]),
        ReactiveFormsModule, UserProfileComponent],
    providers: [
        {
            provide: ActivatedRoute,
            useValue: { snapshot: { data: { formConfig: {} } } },
        },
        { provide: Router, useValue: { navigate: vi.fn().mockResolvedValue(true) } },
        provideHttpClient(withInterceptorsFromDi()),
    ]
}).compileComponents();

    fixture = TestBed.createComponent(UserProfileComponent);
    component = fixture.componentInstance;
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("hides the delete-account danger zone without app.account.delete", async () => {
    const store = TestBed.inject(Store);
    TestBed.inject(AuthStore).setPermissions([], {});

    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector("[data-testid=danger-zone]")).toBeFalsy();
  });

  it("shows the delete-account danger zone with app.account.delete", async () => {
    const store = TestBed.inject(Store);
    TestBed.inject(AuthStore).setPermissions([Permission.AppAccountDelete], {});

    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector("[data-testid=danger-zone]")).toBeTruthy();
    expect(fixture.nativeElement.querySelector("[data-testid=account-delete]")?.textContent).toContain("Delete Account");
  });

  it("gates the edit button on app.account.update", () => {
    const store = TestBed.inject(Store);

    TestBed.inject(AuthStore).setPermissions([], {});
    expect((component as any).canEdit()).toEqual(false);

    TestBed.inject(AuthStore).setPermissions([Permission.AppAccountUpdate], {});
    expect((component as any).canEdit()).toEqual(true);
  });

  it("should init form correctly", () => {
    const store = TestBed.inject(Store);
    seedStore(TestBed.inject(AuthStore), {
      username: "cheetos",
      displayname: "burger",
      defaultAvatarColor: "#CD5C5C",
    });

    component.ngOnInit();

    expect(component.form.value).toEqual({
      username: "cheetos",
      displayName: "burger",
      defaultAvatarColor: "#CD5C5C",
    });
  });

  it("should submit form and update state correctly", () => {
    const store = TestBed.inject(Store);
    const serviceSpy = vi.spyOn(TestBed.inject(UserService), "updateUserProfile");
    const authSpy = vi.spyOn(TestBed.inject(TokenRefreshService), "refreshToken");

    vi.spyOn(TestBed.inject(UserService), "getUserClaims").mockReturnValue(
      of({
        userId: "1",
        displayname: "store",
        username: "general",
      } as any)
    );

    serviceSpy.mockReturnValue(of(undefined) as any);
    authSpy.mockReturnValue(of(undefined as any));

    seedStore(TestBed.inject(AuthStore), {
      userId: "1",
      username: "cheetos",
      displayname: "burger",
      defaultAvatarColor: "#CD5C5C",
    });
    seedStore(TestBed.inject(UserStore), { users: [{ id: 1, displayName: "cheetos", username: "burger" }] });

    component.ngOnInit();
    component.form.patchValue({
      username: "general",
      displayName: "store",
    });

    component.submit();

    const updatedUser = TestBed.inject(AuthStore).loggedInUser();
    const updatedUsers = TestBed.inject(UserStore).users();

    expect(serviceSpy).toHaveBeenCalledWith({
      username: "general",
      displayName: "store",
      defaultAvatarColor: "#CD5C5C",
    } as any);
    expect(authSpy).toHaveBeenCalled();
  });

  describe("avatar colour", () => {
    const signInWithColour = (defaultAvatarColor: string) => {
      seedStore(TestBed.inject(AuthStore), { username: "alex", displayname: "Alex", defaultAvatarColor });
      component.ngOnInit();
    };

    it("offers the household colour menu, with an older custom colour first as the current one", () => {
      signInWithColour("#CD5C5C");

      const swatches = component.avatarSwatches();
      expect(swatches[0]).toMatchObject({ value: "#CD5C5C", name: "current" });
      expect(swatches.slice(1).map((swatch) => swatch.name)).toEqual(GROUP_COLORS.map((color) => color.key));
      expect(swatches.slice(1).every((swatch) => /^#[0-9a-f]{6}$/.test(swatch.value))).toBe(true);
    });

    it("keeps the current colour in place after a pick, so the grid does not shift", () => {
      signInWithColour("#CD5C5C");
      const blue = GROUP_COLORS.find((color) => color.key === "blue")!;

      component.pickAvatarColor(blue.hex);

      expect(component.form.get("defaultAvatarColor")?.value).toBe(blue.hex);
      expect(component.form.dirty).toBe(true);
      expect(component.avatarSwatches()[0].name).toBe("current");
    });

    it("shows only the menu when the saved colour is one of it", () => {
      signInWithColour(GROUP_COLORS[3].hex.toUpperCase());

      expect(component.avatarSwatches().length).toBe(GROUP_COLORS.length);
    });
  });

  it("should open delete account dialog when deleteAccount is called", () => {
    const dialog = TestBed.inject(AppDialog);
    const dialogRefMock = {
      afterClosed: () => of(false),
      componentInstance: {},
    } as any;

    const dialogSpy = vi.spyOn(dialog, "open").mockReturnValue(dialogRefMock);

    component.deleteAccount();

    expect(dialogSpy).toHaveBeenCalledWith(
      DeleteAccountDialogComponent,
      expect.any(Object),
    );
    // No connections loaded (a failed load looks the same): the password dialog.
    expect(dialogSpy.mock.calls[0][1]).not.toHaveProperty("data");
  });

  it("should delete account, dispatch logout, and navigate on confirmation", () => {
    const dialog = TestBed.inject(AppDialog);
    const store = TestBed.inject(Store);
    const router = TestBed.inject(Router);
    const userService = TestBed.inject(UserService);

    const dialogRefMock = {
      afterClosed: () => of({ password: "userpassword" }),
      componentInstance: {},
    } as any;

    vi.spyOn(dialog, "open").mockReturnValue(dialogRefMock);
    const deleteAccountSpy = vi.spyOn(userService, "deleteAccount").mockReturnValue(of(undefined) as any);
    const logout = vi.spyOn(TestBed.inject(AuthStore), "logout");
    const setAuthState = vi.spyOn(TestBed.inject(AuthStore), "setAuthState");
    const navigateSpy = vi.spyOn(router, "navigate").mockResolvedValue(true);

    component.deleteAccount();

    expect(deleteAccountSpy).toHaveBeenCalledWith({ password: "userpassword" });
    expect(logout).toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith(["/"]);
  });

  describe("sign out everywhere", () => {
    const confirmWith = (answer: boolean | undefined) => {
      const instance: Record<string, string> = {};
      vi.spyOn(TestBed.inject(AppDialog), "open").mockReturnValue({ afterClosed: () => of(answer), componentInstance: instance } as any);
      return instance;
    };

    it("offers the button on the profile page", async () => {
      fixture.detectChanges();
      await fixture.whenStable();

      expect(fixture.nativeElement.querySelector("[data-testid=sign-out-everywhere]")).not.toBeNull();
    });

    it("asks first, then ends every session on the server and signs this browser out", () => {
      const dialog = confirmWith(true);
      const signOut = vi.spyOn(TestBed.inject(AuthService), "signOutEverywhere").mockReturnValue(of(undefined) as any);
      const logout = vi.spyOn(TestBed.inject(AuthStore), "logout");
      const setAuthState = vi.spyOn(TestBed.inject(AuthStore), "setAuthState");
      const navigate = vi.spyOn(TestBed.inject(Router), "navigate").mockResolvedValue(true);

      component.signOutEverywhere();

      expect(dialog["headerText"]).toBe("Sign out everywhere");
      expect(dialog["confirmText"]).toBe("Sign out");
      expect(signOut).toHaveBeenCalledTimes(1);
      expect(logout).toHaveBeenCalled();
      expect(navigate).toHaveBeenCalledWith(["/"]);
      expect(component.signingOutEverywhere()).toBe(false);
    });

    it("does nothing when the confirmation is dismissed", () => {
      confirmWith(undefined);
      const signOut = vi.spyOn(TestBed.inject(AuthService), "signOutEverywhere");

      component.signOutEverywhere();

      expect(signOut).not.toHaveBeenCalled();
    });

    it("stays signed in here when the server could not be told", () => {
      confirmWith(true);
      vi.spyOn(TestBed.inject(AuthService), "signOutEverywhere").mockReturnValue(throwError(() => ({ status: 0 })) as any);
      const logout = vi.spyOn(TestBed.inject(AuthStore), "logout");
      const setAuthState = vi.spyOn(TestBed.inject(AuthStore), "setAuthState");
      const navigate = vi.spyOn(TestBed.inject(Router), "navigate");

      component.signOutEverywhere();

      expect(logout).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
      expect(component.signingOutEverywhere()).toBe(false);
    });
  });

  it("should re-open dialog when deleteAccount returns 401", () => {
    const dialog = TestBed.inject(AppDialog);
    const store = TestBed.inject(Store);
    const userService = TestBed.inject(UserService);

    const passwordDialogRef = {
      afterClosed: () => of({ password: "userpassword" }),
      componentInstance: {},
    } as any;
    const cancelledDialogRef = {
      afterClosed: () => of(false),
      componentInstance: {},
    } as any;

    const dialogSpy = vi.spyOn(dialog, "open")
      .mockReturnValueOnce(passwordDialogRef)
      .mockReturnValueOnce(cancelledDialogRef);
    vi.spyOn(userService, "deleteAccount").mockReturnValue(
      throwError(() => ({ status: 401, error: { errorMsg: "Error deleting account." } }))
    );
    const logout = vi.spyOn(TestBed.inject(AuthStore), "logout");
    const setAuthState = vi.spyOn(TestBed.inject(AuthStore), "setAuthState");

    component.deleteAccount();

    expect(dialogSpy).toHaveBeenCalledTimes(2);
    expect(logout).not.toHaveBeenCalled();
  });

  it("keeps the password dialog for an account whose connections were linked, not provisioned", () => {
    const dialog = TestBed.inject(AppDialog);
    const userService = TestBed.inject(UserService);
    const store = TestBed.inject(Store);
    component.connections.set([connection({ provisionedUser: false })]);

    const dialogSpy = vi.spyOn(dialog, "open").mockReturnValue({
      afterClosed: () => of({ password: "userpassword" }),
      componentInstance: {},
    } as any);
    const deleteAccountSpy = vi.spyOn(userService, "deleteAccount").mockReturnValue(of(undefined) as any);

    component.deleteAccount();

    expect(component.isPasswordless()).toBe(false);
    expect(dialogSpy.mock.calls[0][1]).not.toHaveProperty("data");
    expect(deleteAccountSpy).toHaveBeenCalledWith({ password: "userpassword" });
  });

  it("offers a passwordless account its providers and navigates to the chosen one", () => {
    const dialog = TestBed.inject(AppDialog);
    const userService = TestBed.inject(UserService);
    component.connections.set([
      connection({ providerName: "my idp", providerDisplayName: "My IdP" }),
      connection({ providerName: "google", providerDisplayName: "Google" }),
    ]);

    const dialogSpy = vi.spyOn(dialog, "open").mockReturnValue({
      afterClosed: () => of({ providerName: "my idp" }),
      componentInstance: {},
    } as any);
    const navigateSpy = vi
      .spyOn(component as any, "navigateToUrl")
      .mockImplementation(() => undefined);
    const deleteAccountSpy = vi.spyOn(userService, "deleteAccount");

    component.deleteAccount();

    expect(component.isPasswordless()).toBe(true);
    expect(dialogSpy).toHaveBeenCalledWith(
      DeleteAccountDialogComponent,
      expect.objectContaining({
        data: {
          providers: [
            { name: "my idp", displayName: "My IdP" },
            { name: "google", displayName: "Google" },
          ],
        },
      }),
    );
    expect(navigateSpy).toHaveBeenCalledWith(
      "/api/oidc/connections/my%20idp/delete-confirmation"
    );
    // The code comes back on the redirect; nothing is spent yet.
    expect(deleteAccountSpy).not.toHaveBeenCalled();
  });

  it("escapes a provider name in the delete-confirmation URL", () => {
    expect(buildOidcDeleteConfirmationUrl("my provider/../evil")).toBe(
      "/api/oidc/connections/my%20provider%2F..%2Fevil/delete-confirmation"
    );
  });

  describe("returning from a delete confirmation", () => {
    const stripParams = {
      queryParams: { deleteConfirmation: null, deleteError: null },
      queryParamsHandling: "merge",
      replaceUrl: true,
    };

    function initWithQueryParams(queryParams: Record<string, string>): void {
      const route = TestBed.inject(ActivatedRoute) as any;
      route.snapshot.queryParams = queryParams;
      vi
        .spyOn(TestBed.inject(OidcService), "getOidcConnections")
        .mockReturnValue(of([]) as any);

      component.ngOnInit();
    }

    it("strips the code, spends it, signs out and leaves the page", () => {
      const store = TestBed.inject(Store);
      const router = TestBed.inject(Router);
      const route = TestBed.inject(ActivatedRoute);
      const deleteAccountSpy = vi
        .spyOn(TestBed.inject(UserService), "deleteAccount")
        .mockReturnValue(of(undefined) as any);
      const logout = vi.spyOn(TestBed.inject(AuthStore), "logout");
      const setAuthState = vi.spyOn(TestBed.inject(AuthStore), "setAuthState");
      const successSpy = vi
        .spyOn(TestBed.inject(SnackbarService), "success")
        .mockImplementation(() => undefined as any);

      initWithQueryParams({ tab: "user-profile", deleteConfirmation: "the-code" });

      expect(router.navigate).toHaveBeenCalledWith([], { relativeTo: route, ...stripParams });
      expect(deleteAccountSpy).toHaveBeenCalledWith({ confirmationCode: "the-code" });
      // Stripped before spending, so a reload cannot resubmit a spent code.
      expect((router.navigate as Mock).mock.invocationCallOrder[0]).toBeLessThan(
        deleteAccountSpy.mock.invocationCallOrder[0]
      );
      expect(logout).toHaveBeenCalled();
      expect(successSpy).toHaveBeenCalledWith("Your account has been successfully deleted");
      expect(router.navigate).toHaveBeenLastCalledWith(["/"]);
    });

    it("stays signed in when the code is refused", () => {
      const store = TestBed.inject(Store);
      const router = TestBed.inject(Router);
      vi
        .spyOn(TestBed.inject(UserService), "deleteAccount")
        .mockReturnValue(throwError(() => ({ status: 400 })));
      const logout = vi.spyOn(TestBed.inject(AuthStore), "logout");
      const setAuthState = vi.spyOn(TestBed.inject(AuthStore), "setAuthState");

      initWithQueryParams({ deleteConfirmation: "spent-code" });

      expect(logout).not.toHaveBeenCalled();
      expect(router.navigate).not.toHaveBeenCalledWith(["/"]);
    });

    it.each([
      ["identity_mismatch", "You signed in with a different account than the one connected here."],
      ["stale_login", "Your provider didn't ask you to sign in again. Sign out of it and try again."],
      ["not_linked", "That provider is no longer connected to your account."],
      ["forbidden", "Your account can't be deleted this way."],
      ["provider_error", "Could not confirm the account deletion. Please try again."],
      ["constructor", "Could not confirm the account deletion. Please try again."],
    ])("strips deleteError=%s and reports it", (code, message) => {
      const router = TestBed.inject(Router);
      const route = TestBed.inject(ActivatedRoute);
      const deleteAccountSpy = vi.spyOn(TestBed.inject(UserService), "deleteAccount");
      const errorSpy = vi
        .spyOn(TestBed.inject(SnackbarService), "error")
        .mockImplementation(() => undefined as any);

      initWithQueryParams({ deleteError: code });

      expect(router.navigate).toHaveBeenCalledWith([], { relativeTo: route, ...stripParams });
      expect(errorSpy).toHaveBeenCalledWith(message);
      expect(deleteAccountSpy).not.toHaveBeenCalled();
    });

    it("leaves the URL alone without either parameter", () => {
      const router = TestBed.inject(Router);

      initWithQueryParams({ tab: "user-profile" });

      expect(router.navigate).not.toHaveBeenCalled();
    });
  });

  describe("sign-in methods", () => {
    const section = () => fixture.nativeElement.querySelector("[data-testid=sign-in-methods]") as HTMLElement | null;

    async function open(connections: OidcConnectionView[], providerNames: string[], permissions = [Permission.AppAccountUpdate]) {
      const store = TestBed.inject(Store);
      TestBed.inject(AuthStore).setPermissions(permissions, {});
      TestBed.inject(FeatureConfigStore).setFeatureConfig({
            enableLocalSignUp: false,
            aiPoweredReceipts: false,
            oidcProviders: providerNames.map((name) => ({ name, displayName: name.toUpperCase() })),
          });
      vi.spyOn(TestBed.inject(OidcService), "getOidcConnections").mockReturnValue(of(connections) as any);
      fixture.detectChanges();
      await fixture.whenStable();
    }

    it("is not shown on an install without a provider, for an account without a connection", async () => {
      await open([], []);

      expect(section()).toBeNull();
    });

    it("lists the connections, then the switched-on providers that are not connected yet", async () => {
      await open([connection({ provisionedUser: false, email: "alex@example.com" })], ["google", "authentik"]);

      const text = (testId: string) =>
        Array.from(section()!.querySelectorAll(`[data-testid=${testId}]`)).map((row) => row.textContent?.replace(/\s+/g, " ").trim());
      expect(text("oidc-connection").length).toBe(1);
      expect(text("oidc-connection")[0]).toMatch(/^Google\s*alex@example\.com\s*Disconnect$/);
      expect(text("oidc-available").length).toBe(1);
      expect(text("oidc-available")[0]).toMatch(/^AUTHENTIK\s*Not connected\s*Connect$/);
    });

    it("connects a provider by opening the server's address as a page", async () => {
      await open([], ["key cloak"]);
      const navigate = vi.spyOn(component as any, "navigateToUrl").mockImplementation(() => undefined);

      (section()!.querySelector("[data-testid='oidc-connect-key cloak']") as HTMLButtonElement).click();

      expect(navigate).toHaveBeenCalledWith("/api/oidc/link/key%20cloak");
    });

    it("offers no way to drop the only connection of an account without a password, and says why", async () => {
      await open([connection()], ["google"]);

      expect(section()!.querySelector("[data-testid=oidc-disconnect-google]")).toBeNull();
      expect(section()!.querySelector("[data-testid=oidc-connection-required]")?.textContent).toContain("no password");
    });

    it("lets a passwordless account drop one of two connections", async () => {
      await open([connection(), connection({ providerName: "authentik", providerDisplayName: "Authentik" })], []);

      expect(section()!.querySelector("[data-testid=oidc-disconnect-google]")).not.toBeNull();
      expect(section()!.querySelector("[data-testid=oidc-disconnect-authentik]")).not.toBeNull();
    });

    it("is read-only without app.account.update", async () => {
      await open([connection({ provisionedUser: false })], ["google", "authentik"], []);

      expect(section()!.querySelectorAll("button").length).toBe(0);
    });

    it("disconnects after a confirmation and reads the list again", async () => {
      await open([connection({ provisionedUser: false })], ["google"]);
      const confirmation = { afterClosed: () => of(true), componentInstance: {} as Record<string, string> };
      vi.spyOn(TestBed.inject(AppDialog), "open").mockReturnValue(confirmation as any);
      const disconnect = vi.spyOn(TestBed.inject(OidcService), "deleteOidcConnection").mockReturnValue(of(undefined) as any);
      const reload = vi.spyOn(TestBed.inject(OidcService), "getOidcConnections").mockReturnValue(of([]) as any);
      const success = vi.spyOn(TestBed.inject(SnackbarService), "success").mockImplementation(() => undefined as any);

      (section()!.querySelector("[data-testid=oidc-disconnect-google]") as HTMLButtonElement).click();
      await fixture.whenStable();

      expect(confirmation.componentInstance["confirmText"]).toBe("Remove");
      expect(disconnect).toHaveBeenCalledWith("google");
      expect(reload).toHaveBeenCalled();
      expect(success).toHaveBeenCalledWith("Provider disconnected");
      expect(component.connections()).toEqual([]);
    });

    it("leaves the connection alone when the confirmation is dismissed", async () => {
      await open([connection({ provisionedUser: false })], ["google"]);
      vi.spyOn(TestBed.inject(AppDialog), "open").mockReturnValue({ afterClosed: () => of(false), componentInstance: {} } as any);
      const disconnect = vi.spyOn(TestBed.inject(OidcService), "deleteOidcConnection");

      component.disconnectProvider(component.connections()[0]);

      expect(disconnect).not.toHaveBeenCalled();
    });

    it("says so itself when the server refuses the last connection (a refusal without errorMsg)", async () => {
      await open([connection({ provisionedUser: false })], ["google"]);
      vi.spyOn(TestBed.inject(AppDialog), "open").mockReturnValue({ afterClosed: () => of(true), componentInstance: {} } as any);
      vi.spyOn(TestBed.inject(OidcService), "deleteOidcConnection").mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 400, error: { name: "cannot disconnect" } }))
      );
      const error = vi.spyOn(TestBed.inject(SnackbarService), "error").mockImplementation(() => undefined as any);

      component.disconnectProvider(component.connections()[0]);

      expect(error).toHaveBeenCalledTimes(1);
      expect(error.mock.calls[0][0]).toContain("only way into your account");
    });

    it("says a connect worked when the provider sent the browser back, and clears the address", () => {
      const router = TestBed.inject(Router);
      const route = TestBed.inject(ActivatedRoute) as any;
      route.snapshot.queryParams = { tab: "user-profile", oidcLinked: "google" };
      vi.spyOn(TestBed.inject(OidcService), "getOidcConnections").mockReturnValue(of([]) as any);
      const success = vi.spyOn(TestBed.inject(SnackbarService), "success").mockImplementation(() => undefined as any);

      component.ngOnInit();

      expect(success).toHaveBeenCalledWith("Provider connected. You can sign in with it from now on.");
      expect(router.navigate).toHaveBeenCalledWith([], {
        relativeTo: route,
        queryParams: { oidcLinked: null, oidcError: null },
        queryParamsHandling: "merge",
        replaceUrl: true,
      });
    });

    it("says why a connect failed", () => {
      const route = TestBed.inject(ActivatedRoute) as any;
      route.snapshot.queryParams = { tab: "user-profile", oidcError: "already_linked" };
      vi.spyOn(TestBed.inject(OidcService), "getOidcConnections").mockReturnValue(of([]) as any);
      const error = vi.spyOn(TestBed.inject(SnackbarService), "error").mockImplementation(() => undefined as any);

      component.ngOnInit();

      expect(error).toHaveBeenCalledWith("That identity is already connected to another account.");
    });
  });

  it("should not call deleteAccount API when dialog is cancelled", () => {
    const dialog = TestBed.inject(AppDialog);
    const userService = TestBed.inject(UserService);

    const dialogRefMock = {
      afterClosed: () => of(false),
      componentInstance: {},
    } as any;

    vi.spyOn(dialog, "open").mockReturnValue(dialogRefMock);
    const deleteAccountSpy = vi.spyOn(userService, "deleteAccount");

    component.deleteAccount();

    expect(deleteAccountSpy).not.toHaveBeenCalled();
  });
});
