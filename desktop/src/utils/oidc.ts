import { marker } from "../i18n/marker";

/**
 * Signing in with an identity provider. The server runs the whole exchange, so the browser only ever opens one of
 * these addresses as a page (never through HttpClient: it has to follow the redirects to the provider itself) and
 * comes back with a session cookie or an error code in the address.
 */

/** Where a provider's sign-in starts. */
export function buildOidcLoginUrl(providerName: string): string {
  return `/api/oidc/${encodeURIComponent(providerName)}/login`;
}

/** Where connecting a provider to the signed-in account starts. */
export function buildOidcLinkUrl(providerName: string): string {
  return `/api/oidc/link/${encodeURIComponent(providerName)}`;
}

/**
 * The codes the server can send back (`api/internal/oidc/flow.go`), in our own words: what the provider itself said
 * is never passed on.
 */
const OIDC_ERROR_MESSAGES: Record<string, string> = {
  unknown_provider: marker("That sign-in provider is not available."),
  no_account: marker(
    "No CartVibe account is connected to that identity. Sign in with your password and connect it under User Settings, or ask an admin."
  ),
  account_exists: marker(
    "An account with that username already exists. Sign in with your password and connect the provider under User Settings."
  ),
  already_linked: marker("That identity is already connected to another account."),
  invalid_state: marker("That sign-in attempt expired. Please try again."),
  nonce_mismatch: marker("That sign-in attempt could not be verified. Please try again."),
  no_id_token: marker("The provider did not say who you are. Ask an admin to check its settings."),
  provider_error: marker("The sign-in provider could not be reached or reported an error."),
  invalid_request: marker("That sign-in request was not valid."),
  forbidden: marker("Your account is not allowed to do that."),
  default: marker("Signing in with the provider failed. Please try again."),
};

/**
 * The text for a code from the address bar. The code is whatever the address holds, so it is looked up as an own
 * property: an inherited key like "constructor" would otherwise resolve to a function.
 */
export function oidcErrorMessage(code: string): string {
  return Object.hasOwn(OIDC_ERROR_MESSAGES, code) ? OIDC_ERROR_MESSAGES[code] : OIDC_ERROR_MESSAGES["default"];
}
