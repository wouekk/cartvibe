import { HttpErrorResponse } from "@angular/common/http";
import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { NgxsModule } from "@ngxs/store";
import { of, Subject, throwError } from "rxjs";
import { APP_DIALOG_DATA, AppDialogRef } from "../../dialog/app-dialog";
import { OidcProviderService, OidcProviderView } from "../../open-api";
import { SnackbarService } from "../../services";
import { OidcProviderFormComponent, OidcProviderFormData } from "./oidc-provider-form.component";

import type { Mock } from "vitest";

const stored: OidcProviderView = {
  id: 7,
  name: "authentik",
  displayName: "Authentik",
  issuerUrl: "https://auth.example.com/application/o/cartvibe/",
  clientId: "cartvibe",
  scope: "openid profile email",
  allowProvisioning: true,
  linkByUsername: false,
  enabled: true,
  hasClientSecret: true,
  redirectUri: "https://receipts.example.com/api/oidc/authentik/callback",
};

describe("OidcProviderFormComponent", () => {
  let fixture: ComponentFixture<OidcProviderFormComponent>;
  let component: OidcProviderFormComponent;
  let service: { createOidcProvider: Mock; updateOidcProvider: Mock };
  let dialogRef: { close: Mock };
  let snackbar: { success: Mock; error: Mock };

  const setUp = async (data: OidcProviderFormData): Promise<void> => {
    service = { createOidcProvider: vi.fn(() => of(stored)), updateOidcProvider: vi.fn(() => of(stored)) };
    dialogRef = { close: vi.fn() };
    snackbar = { success: vi.fn(), error: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [OidcProviderFormComponent, NgxsModule.forRoot([])],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: APP_DIALOG_DATA, useValue: data },
        { provide: AppDialogRef, useValue: dialogRef },
        { provide: OidcProviderService, useValue: service },
        { provide: SnackbarService, useValue: snackbar },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OidcProviderFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  };

  const element = (testId: string) => fixture.nativeElement.querySelector(`[data-testid=${testId}]`) as HTMLElement | null;

  const fill = (values: Record<string, unknown>) => {
    for (const [name, value] of Object.entries(values)) {
      const control = component.form.get(name)!;
      control.setValue(value);
      control.markAsDirty();
    }
  };

  const submitForm = async () => {
    (element("oidc-provider-form") as HTMLFormElement).dispatchEvent(new Event("submit"));
    await fixture.whenStable();
  };

  describe("adding", () => {
    beforeEach(() => setUp({ serverPublicUrl: "https://receipts.example.com" }));

    it("starts switched on, creating no accounts and matching none by username", () => {
      expect(component.form.getRawValue()).toEqual({
        displayName: "",
        name: "",
        issuerUrl: "",
        clientId: "",
        clientSecret: "",
        scope: "openid profile email",
        enabled: true,
        allowProvisioning: false,
        linkByUsername: false,
      });
    });

    it("suggests the name from the display name until the admin types one", () => {
      component.form.get("displayName")!.setValue("My Authentik");
      expect(component.form.get("name")!.value).toBe("my-authentik");

      fill({ name: "home" });
      component.form.get("displayName")!.setValue("Something else");

      expect(component.form.get("name")!.value).toBe("home");
    });

    it("shows the redirect address to register before the provider exists, following the name", async () => {
      expect(element("oidc-provider-redirect-uri")).toBeNull();
      expect(element("oidc-provider-redirect-missing")).not.toBeNull();

      component.form.get("displayName")!.setValue("Authentik");
      await fixture.whenStable();

      expect(element("oidc-provider-redirect-uri")?.textContent).toBe(
        "https://receipts.example.com/api/oidc/authentik/callback"
      );
      expect(element("oidc-provider-redirect-missing")).toBeNull();
    });

    it("sends nothing while a field is wrong, and marks the fields", async () => {
      fill({ displayName: "Authentik", name: "Not A Slug", issuerUrl: "http://auth.example.com", clientId: "cartvibe" });

      await submitForm();

      expect(service.createOidcProvider).not.toHaveBeenCalled();
      expect(component.form.get("clientSecret")!.touched).toBe(true);
      expect(component.form.get("name")!.errors?.["providerName"]).toBeTruthy();
      expect(component.form.get("issuerUrl")!.errors?.["issuerUrl"]).toBeTruthy();
      expect(component.form.get("clientSecret")!.errors?.["required"]).toBe(true);
    });

    it("creates the provider with trimmed values and closes saying it changed", async () => {
      fill({
        displayName: " Authentik ",
        name: "authentik",
        issuerUrl: " https://auth.example.com/application/o/cartvibe/ ",
        clientId: " cartvibe ",
        clientSecret: " s3cret ",
        allowProvisioning: true,
      });

      await submitForm();

      expect(service.createOidcProvider).toHaveBeenCalledWith({
        name: "authentik",
        displayName: "Authentik",
        issuerUrl: "https://auth.example.com/application/o/cartvibe/",
        clientId: "cartvibe",
        clientSecret: "s3cret",
        scope: "openid profile email",
        enabled: true,
        allowProvisioning: true,
        linkByUsername: false,
      });
      expect(snackbar.success).toHaveBeenCalledWith("Sign-in provider added");
      expect(dialogRef.close).toHaveBeenCalledWith(true);
    });

    it("sends one request however often Save is pressed while it is on its way", async () => {
      const answer = new Subject<OidcProviderView>();
      service.createOidcProvider.mockReturnValue(answer);
      fill({ displayName: "Authentik", name: "authentik", issuerUrl: "https://auth.example.com", clientId: "c", clientSecret: "s" });

      await submitForm();
      await submitForm();

      expect(service.createOidcProvider).toHaveBeenCalledTimes(1);
      expect(component.saving()).toBe(true);

      answer.next(stored);
      answer.complete();

      expect(component.saving()).toBe(false);
    });

    it.each([
      [{ enabled: "a server public URL must be configured" }, "Server Public URL"],
      [{ name: "an OIDC provider with this name already exists" }, "already exists"],
      [{ scope: "Scope must include openid" }, "could not be saved"],
    ])("says a refusal the interceptor leaves alone: %o", async (body, expected) => {
      service.createOidcProvider.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 400, error: body })));
      fill({ displayName: "Authentik", name: "authentik", issuerUrl: "https://auth.example.com", clientId: "c", clientSecret: "s" });

      await submitForm();

      expect(snackbar.error).toHaveBeenCalledTimes(1);
      expect(snackbar.error.mock.calls[0][0]).toContain(expected);
      expect(dialogRef.close).not.toHaveBeenCalled();
      // The form can be sent again after the fix.
      expect(component.saving()).toBe(false);
    });

    it("adds no second message to a failure the interceptor has reported", async () => {
      service.createOidcProvider.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 500, error: { errorMsg: "Error creating OIDC provider" } }))
      );
      fill({ displayName: "Authentik", name: "authentik", issuerUrl: "https://auth.example.com", clientId: "c", clientSecret: "s" });

      await submitForm();

      expect(snackbar.error).not.toHaveBeenCalled();
      expect(component.saving()).toBe(false);
    });

    it("copies the redirect address, and says so when the browser has no clipboard (plain http)", async () => {
      component.form.get("displayName")!.setValue("Authentik");
      const writeText = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal("navigator", { clipboard: { writeText } });

      await component.copyRedirectUri();

      expect(writeText).toHaveBeenCalledWith("https://receipts.example.com/api/oidc/authentik/callback");
      expect(snackbar.success).toHaveBeenCalledWith("Redirect address copied");

      vi.stubGlobal("navigator", {});
      await component.copyRedirectUri();

      expect(snackbar.error).toHaveBeenCalledTimes(1);
      vi.unstubAllGlobals();
    });

    it("closes without a change on Cancel", () => {
      component.closeDialog();

      expect(dialogRef.close).toHaveBeenCalledWith(false);
    });
  });

  it("explains the missing redirect address when the Server Public URL is not set", async () => {
    await setUp({ serverPublicUrl: "" });
    component.form.get("displayName")!.setValue("Authentik");
    await fixture.whenStable();

    expect(element("oidc-provider-redirect-uri")).toBeNull();
    expect(element("oidc-provider-redirect-missing")?.textContent).toContain("Server Public URL");
  });

  describe("changing", () => {
    beforeEach(() => setUp({ provider: stored, serverPublicUrl: "https://other.example.com" }));

    it("shows the stored values, never a secret, and the server's own redirect address", () => {
      expect(component.form.getRawValue()).toMatchObject({
        displayName: "Authentik",
        name: "authentik",
        clientSecret: "",
        allowProvisioning: true,
      });
      expect(element("oidc-provider-redirect-uri")?.textContent).toBe(stored.redirectUri);
    });

    it("locks the name, which is part of the registered redirect address", () => {
      expect(component.form.get("name")!.disabled).toBe(true);

      component.form.get("displayName")!.setValue("Renamed");

      expect(component.form.get("name")!.value).toBe("authentik");
    });

    it("keeps the stored secret by leaving it out of the request", async () => {
      fill({ displayName: "Home sign-in", enabled: false });

      await submitForm();

      expect(service.updateOidcProvider).toHaveBeenCalledTimes(1);
      const [id, command] = service.updateOidcProvider.mock.calls[0];
      expect(id).toBe("7");
      expect(command).toMatchObject({ name: "authentik", displayName: "Home sign-in", enabled: false });
      expect("clientSecret" in command).toBe(false);
      expect(snackbar.success).toHaveBeenCalledWith("Sign-in provider saved");
      expect(dialogRef.close).toHaveBeenCalledWith(true);
    });

    it("sends a new secret when one is typed", async () => {
      fill({ clientSecret: "rotated" });

      await submitForm();

      expect(service.updateOidcProvider.mock.calls[0][1].clientSecret).toBe("rotated");
    });
  });
});
