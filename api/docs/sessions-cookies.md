# Sessions, tokens and cookies

Purpose: how session lifetime, token types, the `Secure` cookie toggle and the pointer-field settings machinery work, and how to recover from a lock-out.

## Refresh-token lifetime

System Settings `refreshTokenValidForHours` and `mcpRefreshTokenValidForHours` (whole hours, 1-720, default 24). The MCP
one is separate so a long human session never silently extends third-party connector tokens.

- It is an **inactivity timeout**, not an absolute cap: refresh tokens rotate on each use and the desktop refreshes every
  15 minutes. Lowering it bites active sessions at their next refresh; nothing is bulk-revoked.
- The access token stays at 20 minutes (`utils.GetAccessTokenExpiryDate`): it is stateless and unrevocable, the client's
  refresh timer is sized against it, and the OAuth `expires_in` mirrors it.
- `utils` cannot read settings (import cycle), so `GetRefreshTokenExpiryDate(lifetime)` takes the duration;
  `services.GetRefreshTokenLifetime()` / `GetMcpRefreshTokenLifetime()` read live and clamp
  (`clampRefreshTokenLifetime`, fallback 24 h). The clamp, not the validator, is the safety net. Bounds live in
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
  credential, an `rw` API key or a bearer JWT from `POST /api/login/?tokensInBody=true`:

```bash
HOST=http://receipts.lan
AUTH='key.1.<id>.<secret>'   # or AUTH="Bearer <jwt>"
curl -s -H "Authorization: $AUTH" "$HOST/api/systemSettings/" \
  | jq '.secureCookies = false' \
  | curl -s -X PUT -H "Authorization: $AUTH" -H 'Content-Type: application/json' -d @- "$HOST/api/systemSettings/"
```

The PUT validates a whole body, hence the GET round trip (and the `rw` key).

## Housekeeping

The `@every 24h` refresh-token cleanup deletes used and expired rows. `repositories.SetSecureCookiesForTests` flips the
toggle in tests. There is no e2e for the toggle: it would change every concurrent spec's session.
