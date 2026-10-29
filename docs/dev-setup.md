# Development setup

Local toolchains and the manual steps behind the automated ones. Read it when you need to build, test or regenerate
something outside CI. GitHub Actions is the real build and test machine either way.

## Windows PC (bash; tools live in `C:\Users\Marcin\tools\`, outside the repo)

- **Go** is installed but not on the bash PATH: `export PATH="$PATH:/c/Program Files/Go/bin"`.
  `api/scripts/go-without-cgo.sh vet ./...` (or `test <pkg>`, `build -o <path> .`) stubs the ImageMagick and Tesseract
  cgo bindings. The services package's ImageMagick tests and some wranglerasynq temp-path tests fail here only.
- **PDF tests:** `api/scripts/install-test-chromium.sh` once, then `api/scripts/test-pdf.sh`.
- **Node 24.22.1 + npm 11.19.1** (CI's versions) in `tools\node-v24.22.1-win-x64`, not on the PATH:
  `export PATH="/c/Users/Marcin/tools/node-v24.22.1-win-x64:$PATH"`. `npm ci`, `npx ng test --include "<glob>"` and `npx ng build`
  work in `desktop/`. A lockfile regenerated here must still pass CI's `npm ci`.
- **Python** is not installed. `api/internal/reporting/mutation-check.sh` needs `python3`; a shim in a PATH folder works:
  `exec uv run --no-project --quiet python "$@"`.
- Not available: Docker, real Redis, ImageMagick, Tesseract, Java.
- `gh` needs `--repo wouekk/cartvibe`. Git's LF/CRLF warnings are harmless.

### Local stack (`tools\devstack\`)

1. Redis stand-in: `redis\miniredis.exe` on :6379 (start it first).
2. API: `api.exe`, built with `bash api/scripts/go-without-cgo.sh build -o <path> .`; `api.cmd` runs it from `run\` on
   :8081 (SQLite `dev.db`, `TZ=Europe/Paris`). Rebuild after API changes; delete `run\dev.db` for a fresh database.
3. Web: `npm start` in `desktop/` (`web.cmd`) serves :4200 and proxies `/api` to :8081. Log in as `admin` / `admin`.
4. Screenshots: `shot.cjs` (Playwright) logs in and writes PNGs to `shots\`.

Keep one app tab open: two tabs hot-reloading at once both rotate the shared refresh token and sign each other out.
Functional checks (clicking through, screenshots) are done in English; switch the test account under Settings → Language.

## MacBook

May have more toolchains than the PC; check before assuming. The commands above work unchanged once Go and Node are on
the PATH.

## Cloud sandbox

Component-specific setup: `api/docs/sandbox.md` and `desktop/docs/sandbox.md`.

## Regenerating the API client by hand

Normally automatic: pushing an `api/swagger.yml` change on a `feature/**` branch runs `regenerate-clients.yml`, which
commits the regenerated `desktop/src/open-api/`. By hand, from `api/`:

```bash
./generate-client.sh desktop ../desktop/src/open-api
```

If `npx @openapitools/openapi-generator-cli` fails with `EACCES` (root-owned global npm prefix, e.g. on macOS), run the
pinned jar (version in `api/openapitools.json`) with
`java -jar openapi-generator-cli-<version>.jar generate -i swagger.yml -g typescript-angular -o ../desktop/src/open-api`.

A value added to a Go enum the API serializes goes into `swagger.yml` in the same change. If the value is also stored
(for example a queue name in `task_queue_configurations`), existing installs need a backfill on the stored side too, or
validation rejects their next save.
