import { AbstractControl, ValidationErrors, ValidatorFn } from "@angular/forms";
import { marker } from "../../i18n/marker";

/**
 * The rules for a sign-in provider, as the server has them (`api/internal/commands/upsert_oidc_provider_command.go`),
 * so a mistake shows under its field instead of as a refused save. The server checks again.
 */

/** Names that are already an address under `/api/oidc/`. */
export const RESERVED_PROVIDER_NAMES: readonly string[] = ["login", "callback", "link", "exchange", "connections"];

const PROVIDER_NAME_PATTERN = /^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$/;

const LOOPBACK_HOSTS: readonly string[] = ["localhost", "127.0.0.1", "[::1]"];

/** The name is a piece of the provider's addresses, so it is a slug: lowercase letters, numbers and dashes. */
export function providerNameValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const name = String(control.value ?? "").trim();
    if (!name) {
      return null;
    }
    if (!PROVIDER_NAME_PATTERN.test(name)) {
      return {
        providerName: marker("Use lowercase letters, numbers and dashes, starting and ending with a letter or number."),
      };
    }
    if (RESERVED_PROVIDER_NAMES.includes(name)) {
      return { providerName: marker("That name is reserved. Pick another one.") };
    }
    return null;
  };
}

/** Without `openid` the provider sends no identity, and there is nothing to sign anyone in with. */
export function openidScopeValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const scope = String(control.value ?? "").trim();
    if (!scope || scope.split(/\s+/).includes("openid")) {
      return null;
    }
    return { scope: marker("The scope must include openid.") };
  };
}

/** An absolute address, https unless the provider runs on this machine (the secret travels to it). */
export function issuerUrlValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const raw = String(control.value ?? "").trim();
    if (!raw) {
      return null;
    }

    let parsed: URL | undefined;
    if (/^https?:\/\//i.test(raw)) {
      try {
        parsed = new URL(raw);
      } catch {
        parsed = undefined;
      }
    }
    if (!parsed?.hostname || parsed.username || parsed.password) {
      return { issuerUrl: marker("Enter the whole address, like https://auth.example.com") };
    }
    if (parsed.protocol === "https:" || LOOPBACK_HOSTS.includes(parsed.hostname)) {
      return null;
    }
    return { issuerUrl: marker("The address must start with https:// (http:// only works for localhost).") };
  };
}

/** A name for the address from what the admin called the provider: "My Authentik" gives "my-authentik". */
export function slugFromDisplayName(displayName: string): string {
  return displayName
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/, "");
}

/**
 * The address a provider sends people back to, which the admin registers there before the provider can be saved
 * here. Built like the server builds it (`BuildOidcRedirectUri`): the origin of the Server Public URL, then the
 * provider's name. Empty while either is missing or the URL is not an address.
 */
export function redirectUriFor(serverPublicUrl: string | undefined, providerName: string): string {
  const name = providerName.trim();
  if (!serverPublicUrl?.trim() || !name) {
    return "";
  }
  try {
    return `${new URL(serverPublicUrl.trim()).origin}/api/oidc/${name}/callback`;
  } catch {
    return "";
  }
}
