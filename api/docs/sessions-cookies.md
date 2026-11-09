# Sessions, tokens and cookies

Purpose: how session lifetime, token types, the `Secure` cookie toggle and the pointer-field settings machinery work, and how to recover from a lock-out.

## Refresh-token lifetime

System Settings `refreshTokenValidForHours` and `mcpRefreshTokenValidForHours` (whole hours, 1-720). A person's session
defaults to 720 (30 days: a family member who skips a day should not have to sign in again at the shop door); a
connector's to 24. The MCP one is separate so a long human session never silently extends third-party connector tokens.

- A new install is seeded with 720 (`repositories.DefaultSessionLifetimeHours`). The data migration
  `session-lifetime-30-days-v1` lifts a stored 24 (the old default) or 0 to 720 once; any other value was chosen by
  someone and stays. The column's own default is still 24 so the schema does not change; the seed and the migration
  are what decide.

- It is an **inactivity timeout**, not an absolute cap: refresh tokens rotate on each use and the desktop refreshes every
  15 minutes. Lowering it bites active sessions at their next refresh; nothing is bulk-revoked.
- The access token stays at 20 minutes (`utils.GetAccessTokenExpiryDate`): it is stateless and unrevocable, the client's
  refresh timer is sized against it, and the OAuth `expires_in` mirrors it.
- `utils` cannot read settings (import cycle), so `GetRefreshTokenExpiryDate(lifetime)` takes the duration;
  `services.GetRefreshTokenLifetime()` / `GetMcpRefreshTokenLifetime()` read live and clamp
  (`clampRefreshTokenLifetime`, falling back to 720 h for a session and 24 h for a connector). The clamp, not the
  validator, is the safety net. Bounds live in
  `commands` and are imported by `services`, so they cannot drift.
- Explicit `0` means "use the default" (the `pdfDpi` convention).

## Omitted keys and pointer fields

`UpdateSystemSettings` writes every column (`Select("*")`), so a plain `int`/`bool`/`string` on the command would reset
a stored value whenever a client sends a partial body. Settings that must survive omission are pointers on
`UpsertSystemSettingsCommand` (the lifetimes, `tempFileRetentionHours`, `serverPublicUrl`, `timeZone`, `secureCookies`).
An omitted one is listed by `OmittedColumns()` and **dropped from the UPDATE** (not copied from the stored row: two
admins saving different fields concurrently would clobber each other). `ApplyOmittedValues` only makes the response echo
the stored value. No row lock: SQLite rejects `SELECT … FOR UPDATE`.

## Access vs refresh tokens

Both are minted with the same key, issuer and audience, so `Claims.TokenType` (`access` / `refresh`) separates them.
Access paths (`UnifiedAuthMiddleware`, `mcp.verifyToken`) reject refresh tokens; refresh paths require one.
`Claims.IsRefreshToken()` also treats a typeless token **with** a `jti` as refresh (only refresh tokens ever had one), so
old access tokens keep working while old refresh tokens are refused.

Refresh consumption is atomic: `middleware.RevokeRefreshToken` does `UPDATE … WHERE token = ? AND is_used = false` and
checks `RowsAffected` (mirrors `oauth.rotateRefreshToken`). A read-then-update let two concurrent refreshes both rotate.
Unknown and used tokens answer the same. Two app tabs hot-reloading at once still race on the shared refresh token; the
loser signs both out.

**A refused refresh token answers 401** (`refusedRefreshTokenStatus` in `middleware/refresh_token.go`: missing, invalid,
not a refresh token, unknown or already used), on `POST /token` and `POST /logout`. It is the one place the API uses
401: the web app signs a person out only on a 401 or 403 from the refresh call, and keeps the session through anything
else (no connection, a restart, a 429 or a 5xx), so "refused" must not look like "could not ask". A database error
while checking stays a 500 for the same reason.

## `Secure` cookies (`secureCookies`)

Off by default on purpose: plain-http LAN installs are supported and a browser drops `Secure` cookies over http, which
breaks login. `dev` forces it on (it uses `SameSite=None`, which requires `Secure`). Otherwise session cookies are
`SameSite=Strict`, the OIDC binding cookie `Lax`.

- `services.UseSecureCookies()` is the only resolver, read live with no cache; every cookie builder asks it
  (`BuildTokenCookies`, `GetEmptyAccessTokenCookie`, `GetEmptyRefreshTokenCookie`, `oidc.buildBindingCookie`,
  `clearBindingCookie`). A new cookie must too.
- CodeQL `go/insecure-cookie` alerts on the default are accepted. Auto-detecting from `X-Forwarded-Proto` was rejected:
  behind a second TLS proxy the container's nginx reports `http`.
- Turning it on over plain http locks the web app out, admin included (the desktop warns first). Recovery with an admin
  credential: sign in with the tokens in the body (no cookie is set) and send the JWT as a bearer token:

```bash
HOST=http://receipts.lan
JWT=$(curl -s -X POST -H 'Content-Type: application/json' -d '{"username":"admin","password":"<password>"}'   "$HOST/api/login/?tokensInBody=true" | jq -r .jwt)
AUTH="Bearer $JWT"
curl -s -H "Authorization: $AUTH" "$HOST/api/systemSettings/" \
  | jq '.secureCookies = false' \
  | curl -s -X PUT -H "Authorization: $AUTH" -H 'Content-Type: application/json' -d @- "$HOST/api/systemSettings/"
```

The PUT validates a whole body, hence the GET round trip.

## Housekeeping

The `@every 24h` refresh-token cleanup deletes used and expired rows. `repositories.SetSecureCookiesForTests` flips the
toggle in tests. There is no e2e for the toggle: it would change every concurrent spec's session.
