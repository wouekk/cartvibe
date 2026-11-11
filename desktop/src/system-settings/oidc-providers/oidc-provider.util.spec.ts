import { FormControl } from "@angular/forms";
import {
  issuerUrlValidator,
  openidScopeValidator,
  providerNameValidator,
  redirectUriFor,
  slugFromDisplayName,
} from "./oidc-provider.util";

describe("sign-in provider rules", () => {
  const errorsOf = (validator: ReturnType<typeof providerNameValidator>, value: unknown) =>
    validator(new FormControl(value));

  describe("the name", () => {
    it.each(["authentik", "a", "key-cloak-2", "0idc"])("accepts %s", (name) => {
      expect(errorsOf(providerNameValidator(), name)).toBeNull();
    });

    it.each(["Authentik", "my provider", "-lead", "trail-", "a_b", "a".repeat(65)])("refuses %s", (name) => {
      expect(errorsOf(providerNameValidator(), name)?.["providerName"]).toContain("lowercase letters");
    });

    it.each(["login", "callback", "link", "exchange", "connections"])("refuses the reserved %s", (name) => {
      expect(errorsOf(providerNameValidator(), name)?.["providerName"]).toContain("reserved");
    });

    it("leaves an empty name to the required rule", () => {
      expect(errorsOf(providerNameValidator(), "")).toBeNull();
      expect(errorsOf(providerNameValidator(), null)).toBeNull();
    });
  });

  describe("the scope", () => {
    it("needs openid as a word of its own", () => {
      expect(errorsOf(openidScopeValidator(), "openid profile email")).toBeNull();
      expect(errorsOf(openidScopeValidator(), "  profile   openid ")).toBeNull();
      expect(errorsOf(openidScopeValidator(), "profile email")?.["scope"]).toContain("openid");
      expect(errorsOf(openidScopeValidator(), "openid-connect")?.["scope"]).toContain("openid");
      expect(errorsOf(openidScopeValidator(), "")).toBeNull();
    });
  });

  describe("the issuer address", () => {
    it.each([
      "https://auth.example.com",
      "https://auth.example.com/application/o/cartvibe/",
      "HTTPS://auth.example.com",
      "http://localhost:9000/realms/home",
      "http://127.0.0.1:8080",
      "http://[::1]:8080",
    ])("accepts %s", (url) => {
      expect(errorsOf(issuerUrlValidator(), url)).toBeNull();
    });

    it.each(["auth.example.com", "https:auth.example.com", "ftp://auth.example.com", "https://user:secret@auth.example.com"])(
      "asks for the whole address instead of %s",
      (url) => {
        expect(errorsOf(issuerUrlValidator(), url)?.["issuerUrl"]).toContain("whole address");
      }
    );

    it("refuses plain http for a provider on another machine", () => {
      expect(errorsOf(issuerUrlValidator(), "http://auth.example.com")?.["issuerUrl"]).toContain("https://");
      expect(errorsOf(issuerUrlValidator(), "http://192.168.1.20:9000")?.["issuerUrl"]).toContain("https://");
    });

    it("leaves an empty address to the required rule", () => {
      expect(errorsOf(issuerUrlValidator(), "")).toBeNull();
    });
  });

  describe("the name suggested from the display name", () => {
    it.each([
      ["Authentik", "authentik"],
      ["My Authentik!", "my-authentik"],
      ["  Dom / Keycloak  ", "dom-keycloak"],
      ["Żółw SSO", "zo-w-sso"],
      ["---", ""],
    ])("turns %s into %s", (displayName, slug) => {
      expect(slugFromDisplayName(displayName)).toBe(slug);
    });

    it("never suggests a name the rule would refuse", () => {
      const slug = slugFromDisplayName("x".repeat(63) + " y");

      expect(slug.length).toBeLessThanOrEqual(64);
      expect(errorsOf(providerNameValidator(), slug)).toBeNull();
    });
  });

  describe("the redirect address", () => {
    it("is the origin of the Server Public URL, then the provider's name", () => {
      expect(redirectUriFor("https://receipts.example.com", "authentik")).toBe(
        "https://receipts.example.com/api/oidc/authentik/callback"
      );
      expect(redirectUriFor(" https://receipts.example.com/some/path?x=1 ", " authentik ")).toBe(
        "https://receipts.example.com/api/oidc/authentik/callback"
      );
      expect(redirectUriFor("http://192.168.1.20:8080/", "kc")).toBe("http://192.168.1.20:8080/api/oidc/kc/callback");
    });

    it("is empty while the URL or the name is missing, or the URL is not an address", () => {
      expect(redirectUriFor("", "authentik")).toBe("");
      expect(redirectUriFor(undefined, "authentik")).toBe("");
      expect(redirectUriFor("https://receipts.example.com", " ")).toBe("");
      expect(redirectUriFor("receipts", "authentik")).toBe("");
    });
  });
});
