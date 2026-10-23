# OIDC login in depth

Purpose: why the OIDC relying-party flow (`internal/oidc/`) is built the way it is; read before touching login, linking, provisioning or account deletion.

The API is a confidential client that owns the whole exchange (discovery, PKCE, state, nonce, code exchange, ID token
verification); no browser code sees an IdP token or the client secret. It shares nothing with `internal/oauth` (the MCP
authorization server) but two `utils` primitives. There is only the browser flow.

## Identity anchor

`models.OidcIdentity` is unique on `(oidc_provider_id, subject)` and `(oidc_provider_id, user_id)`. Every login after the
first resolves by `sub` alone, so an IdP rename or a recycled username cannot re-point an account. `Subject` is capped at
255 to keep the composite index under MySQL's limit.

First login only (`resolveUser`):
1. Attach to a local account whose username equals `preferred_username`, only if the provider's `LinkByUsername` is on
   (default off: public IdPs recycle usernames, so it is a takeover path against a local `admin`). The match is
   re-checked byte for byte in Go (`usernameMatchesClaim`) because MySQL's default collation is case-insensitive; an
   inexact match falls through to provisioning, which refuses the collision.
2. Provision, if `AllowProvisioning`.
3. Otherwise `no_account`.

- A username collision refuses (`ErrAccountExists`) rather than suffixing: `bob-2` looks like data loss.
- The account and its identity row are written in **one transaction** (`CreateUser` nests as a savepoint). Separately,
  a lost identity insert (two racing first logins) left an orphan that `deriveUsername` then collided with forever.
- A provisioned account's password is random and discarded (a sentinel would become a working password), and
  `LoginUser` refuses passwordless accounts (`ErrPasswordLoginUnavailable`, decided by `IsAccountPasswordless`). The
  check runs after the bcrypt compare and callers replace the error with the wrong-password text, so timing and body
  do not reveal which usernames are IdP accounts. An admin's password reset clears the flag.
- Known gap: deleting a provider deletes its identity rows and with them the passwordless fact; such an account then
  reads as local. Fix would move the fact onto `User` (schema change, deferred).
- `services.DeleteUser` removes identities, pending signed-in sessions (`link_user_id`) and delete confirmations
  explicitly; two of those tables have no FK, and an orphaned identity would sign its subject into whichever account
  reuses the id. `TestDeleteUser_RemovesOidcRecords` runs with foreign keys off
  (`UseTestDbWithoutForeignKeysForTests`; pinning one connection with the pragma off deadlocks).

## Callback order (`flow.go` `Callback`, fail closed)

1. An IdP `error` → error redirect, never echoing upstream text.
2. Consume the auth session atomically (`UPDATE … WHERE state_hash = ? AND used = false AND expires_at > ?`, check
   `RowsAffected`) **before any network call**. Unknown, expired and used look the same.
3. The session's provider must match.
4. Browser binding cookie, compared by hash in constant time; stops planting an attacker's state+code in a victim's
   browser. It is `SameSite=Lax` (the callback is a cross-site top-level GET; Strict would drop it only in production).
5. `Exchange` with the PKCE verifier.
6. A missing `id_token` is a hard failure (userinfo is unsigned).
7. `Verify` (JWKS signature, `iss`, `aud`, `exp`).
8. Compare the nonce ourselves (go-oidc does not); an empty nonce is rejected first.

Failures route by the session's purpose (`failCallback`, `redirectSignedInError`): a link or delete confirmation returns
to the profile page, a login to the login page. Before the consume there is no session, so `pendingSession` reads the
live row's routing (`GetPendingAuthSessionRouting`); a user who declines consent lands where they started. Redirect
targets are server-side constants; no `redirect_uri` or `returnUrl` is taken from the request.

## Storage

State, nonce and delete-confirmation codes are stored hashed (`utils.Sha256Hash`). The PKCE verifier must be replayed,
so it is AES-GCM encrypted, like the client secret. TTLs: auth session 10 min (covers MFA), delete confirmation 5 min.
An `@every 24h` sweep is hygiene; `expires_at` is in every consume's WHERE.

## Linking and unlinking

`GET /oidc/link/{name}` runs the flow with `LinkUserId` set; the callback skips match/provision and writes the link.
The middleware reads the `jwt` cookie before the header, so a top-level navigation authenticates.

- Gated on `app.account.update` (adding a sign-in method is at least as privileged as removing one), checked in the
  handler body because the route answers with a redirect.
- Link and unlink require `AuthSourceJwt` (see `authorization.md` → AuthSource). `GET /oidc/connections` keeps API-key
  access.
- `ProvisionedUser` is an account fact held on every identity row: `provisionUser` sets it, `resolveLink` inherits it,
  `ClearProvisionedFlagForUser` clears it when a password is set (`handlers.ResetPassword`), and `UnlinkIdentity`
  re-asserts it before deleting a flagged row. Unlinking refuses the last identity of a passwordless account.
- Static route segments (`link`, `connections`, …) come first and `commands.ReservedOidcProviderNames` rejects them as
  slugs. The provider name is immutable (it is in the registered redirect URI).

## Confirming account deletion with a provider

A passwordless account confirms self-delete by signing in at one of its providers again.

- `OidcAuthSession.Purpose`: `""` login, `link`, `delete_account`. A row with `""` plus `LinkUserId` reads as a link.
  Test `IsLink()` / `FlowPurpose()`, never `LinkUserId != nil`.
- Start `GET /oidc/connections/{name}/delete-confirmation` (`DeleteConfirmationStart`): shares `authorizeSignedInStart`
  (interactive session, `app.account.delete`), then refuses a password account (`forbidden`) and a provider the account
  has no identity at (`not_linked`).
- Fresh sign-in via `max_age=0` only; do not add `prompt=login` (Google does not document it).
  `TestLoginAndLinkDoNotAskForAFreshLogin` pins that login and link do not send it.
- `finishDeleteConfirmation`: the `(provider, sub)` identity must be the session user's (`identity_mismatch`); if
  `auth_time` is present it must not predate the session's `CreatedAt` minus 60 s (`stale_login`); if absent the round
  trip is accepted (refusing would make deletion impossible on such providers). `auth_time` decodes through the
  tolerant `tolerantTime`.
- Nothing is deleted in the callback: it mints an `OidcDeleteConfirmation` (hashed, 5 min, single use) and redirects to
  the profile with `deleteConfirmation=…` (errors as `deleteError=…`; link errors as `oidcError=…`).
- `DeleteAccountForUser`: the account decides which proof applies. Passwordless must send `confirmationCode`, consumed
  atomically with the account in the WHERE (`ConsumeDeleteConfirmation`); a password account sends its password and a
  code is ignored. A code refusal is 400, not 401 (the desktop reads 401 as "ask for the password again").

## Configuration

- Providers live in `oidc_providers`, administered in System Settings. Redirect URI:
  `{serverPublicUrl}/api/oidc/{name}/callback`. `serverPublicUrl` is separate from `mcpPublicUrl` so an OIDC tweak cannot
  invalidate MCP tokens.
- The dependency is enforced both ways: `OidcProviderService.validateCrossSettingRules` refuses to enable a provider
  without it, `handlers.serverPublicUrlStillNeeded` refuses to clear it while one is enabled (otherwise
  `GetServerPublicUrl` falls back to localhost and the IdP rejects every login).
- `UpdateOidcProvider` uses map-form `Updates` (the toggles are security switches); `OidcProvider.Enabled` has no
  `default:true` tag (GORM would skip a `false` on create).
- `GET /featureConfig` publishes only `{name, displayName}`, always `[]`.

## Provider cache and off-spec providers

- The `*oidc.Provider` (which owns the JWKS cache) is cached per provider id and valid only while the issuer and the
  row's `UpdatedAt` match, so an edit invalidates it on every replica by construction. Discovery uses a fresh
  `context.Background()` with a timeout, never the request context (the Provider keeps its HTTP client).
- Twitch puts no `email` in the ID token without a `claims` parameter; identity anchors on `sub`, so it works without
  it. The claims decoder accepts `email_verified` as bool or string.

## Tests

`oidc/flow_test.go` runs against a real fake IdP (`fake_idp_test.go`: discovery, JWKS, RS256-signed tokens) covering
replay, expiry, cross-provider state, binding cookie, nonce, missing `id_token`, foreign key/audience and both happy
paths. Also `provision_test.go`, `link_test.go`, `delete_confirmation_test.go`, `store_test.go` (atomic consume under
concurrency), `provider_cache_test.go`, `claims_test.go`.
