# HANDOFF.md — Where things stand

## Status (2026-10-22, Windows PC, Claude Code desktop app)

**Receipts search + product checker (branch `feature/product-check`, worktree `../product-check`, not merged; plan in `C:/Users/Marcin/.claude/plans/pasted-content-id-f19d-refactor-the-sprightly-moore.md`).**
- Done: the header search moved into the Receipts toolbar and is now typo/abbreviation tolerant over shop, name, comments and
  product lines (API `ReceiptPagedRequestFilter.search`, `utils/fuzzy_match.go`, `Receipt.searchMatches` shown as a "Matched:" line);
  the header slot is now a browser-only Open Food Facts **barcode** checker (typed or camera scan, drawer with health score,
  Nutri-Score, NOVA, additives, nutrition, 10 recent scans). See `api/CLAUDE.md` "Receipt search" and `desktop/CLAUDE.md` "Receipts
  search and the product checker". Jest 2149/2149, `ng build` OK, Go tests of the touched packages pass; seen locally in both
  themes and at phone width (dev stack, screenshots).
- **Decision, by the user: no name search in the checker.** Open Food Facts answers cross-site browser requests to its search
  endpoints with a 503 and its search service has no CORS, so only barcodes work from a browser (a server relay was rejected).
- Not verified: the camera scan on a real device (needs HTTPS: Android Chrome and iPhone Safari on the NAS), the CSP report
  console (the Report-Only policy now allows `world.openfoodfacts.org` and `images.openfoodfacts.org`), and Polish wording.
- `@zxing/browser` 0.1.5 + `@zxing/library` 0.21.3 are pinned on purpose: library 0.22+ needs Node 24 (CI pins 20.19.6).
- Deleted: the header search bar (`src/searchbar/`) and `e2e/search-bar-visibility.spec.ts`; `legacy-user-visibility.spec.ts` now
  checks the product checker. e2e cannot run here.
- **Merge hazards:** this branch is cut from `main`. Another session has uncommitted translation work in the main checkout
  (`src/i18n` moved to `assets/i18n/*.json`, `pl.messages*.ts` deleted) and a `feature/remove-mobile` branch; this branch adds
  `i18n/languages/pl.messages-product-check.ts` and regenerated `mobile/api/`, so both will conflict. Port the new Polish keys
  into whichever translation format wins, and drop `mobile/api/` changes if mobile is removed first.

**Settings layout (2026-10-21, merged into `main` on the user's go; every settings page is wide, Save in the card footer; screenshots checked in both themes, Jest 2090/2090, `ng build` OK). NAS note: the old ENCRYPTION_KEY was lost, so the user wipes the sqlite folder and sets new keys; write them down.** settings layout
unification, plan in `C:/Users/Marcin/.claude/plans/pasted-content-id-ff27-perform-a-cheeky-nebula.md` (outside the repo). Decisions by the user: topics inside a
card are flat hairline rows (no inset box), Save sits in a card footer on the right (status text left).
- Done (Jest for the touched folders green, `ng build` OK): CSS `rw-card*` / `rw-inset` in `src/tailwind.css`; four primitives in
  `src/shared-ui/settings/` (`app-settings-page`, `-section`, `-tabs`, `-entity-list`, with specs, declared in `SharedUiModule`);
  `app-filter-bar` and `app-tabs` render through `app-settings-tabs`; `app-form` has a `settingsCard` input; converted: System Settings
  (page, form cards, system tasks card, logs), AI page + backup card, User Settings (profile, preferences, theme, API keys, danger zone),
  the five Manage lists, household detail shell (`group-tabs`).
- (done, kept for the record) look at screenshots (White/Black, 1440 and 390 px, `C:/Users/Marcin/tools/devstack/shot.cjs`) and fix what looks off (table card inside
  `rw-card`, exchange-rates section, footers); run the full `npm run test:ci`; docs (`desktop/CLAUDE.md` "settings card standard" and
  AGENTS.md "Decided direction" still describe the inset `rw-section`); commit, push, wait for CI, then
  `gh workflow run publish-image.yml --repo wouekk/cartvibe --ref feature/settings-layout` for `:preview`. No merge to `main`.
- Deviation from the plan: rows stay stacked (no two-column md layout yet); `app-table-header` is unchanged and still used by receipts,
  reports and shopping lists.

**v0.2.0 is released (2026-10-21):** `feature/redesign` was fast-forwarded into `main` (`033f9ae9`) and tagged `v0.2.0`; CI on `main` and the `:latest` publish were green. It holds the Tailwind + spartan/ui redesign (White/Black themes), Polish translation, shop logos (about 230 chains, `scripts/shop-logos/`, Logo.dev credit in `NOTICE.md`), the AI model dropdown and backup AI card, the 3-try AI cap, HEIC/photo normalization, the settings-card standard (`rw-section`, see `desktop/CLAUDE.md`), shopping-list item suggestions and the upload progress bar. **Not yet seen on the NAS:** pull `:latest` and redeploy, then look at every page in both themes and Polish. Post-release work (shopping-list master-detail `e0e7a61a`, image hardening) lives on other `feature/*` branches and is not in 0.2.0. Still open: Polish for strings built in TypeScript, parked per-user currency work, stale Playwright specs (no live API here).
**Latest (frontend security sweep, same branch `feature/image-hardening`):** audit found nothing exploitable; hardening applied:
nginx `Permissions-Policy`, HSTS (only when `X-Forwarded-Proto` is https), dotfile/`.map` 404, headers repeated on the hashed-asset
location, `/oauth/` with `frame-ancestors 'none'` + `no-store`, and a **Content-Security-Policy in Report-Only mode** on the app
shell; production build with `sourceMap: false` and `inlineCritical: false`; SVG uploads rejected (`ValidateFileType`);
`Content-Disposition` of the image download built with `mime.FormatMediaType`. Untested locally: nginx/CSP (no Docker) and `ng build`
(no Node on PATH) - CI and `:preview` are the judge. `TestValidateFileType_AcceptsPdf` fails on this PC only (stubbed ImageMagick).
**To do on the NAS with `:preview`:** watch the browser console for CSP reports (Quick Scan dialog, report preview, image viewer,
both themes), then rename `Content-Security-Policy-Report-Only` to `Content-Security-Policy` in `docker/default.conf`. The CSP hash
for the inline theme script in `index.html` must be recomputed from the BUILT `dist/index.html` first. Not done: login rate limit
keys on the proxy address (needs `set_real_ip_from` with the Synology proxy's IP).

**Update (same day): `:preview` from `eac696a2` runs on the NAS and the user checked it.** The first try crash-looped
("Failed to initialize log"): DSM folder ACLs refuse the image's uid 10001 whatever chown says. The entrypoint now checks the
folders as the target user and falls back to root with a log line; `PUID` / `PGID` (Dockhand variables, compose
`${PUID:-}`) run the API as the DSM user that owns the folders, and that is how the NAS runs now. The tested image was built
from `5e34bbc9`; `b6d7cb89` (CSP report-only, security headers, SVG uploads refused; another session) came later and is not in
it yet, so re-publish `:preview` and look again before merging. Next: merge to `main` on the user's go (with
`feature/redesign`, release v0.2.0).

**Latest (image hardening + faster OCR/AI, branch `feature/image-hardening`, cut from `feature/redesign`):** triage of the
grype report of the old `receipt-wrangler:latest` image, done together with the scan latency work. One AI call per Quick Scan
(products applied inline, the sweep stays the fallback), Gemini on `google.golang.org/genai` with thinking turned down, photos
shrunk in the browser before upload, EasyOCR/PyTorch removed (Tesseract only), API runs as uid 10001 via `setpriv`, ImageMagick
coder deny-list, `apt-get upgrade`, nginx headers, weekly no-cache rebuild + grype report artifact in `publish-image.yml`.
CI green on `048ca387`. Locally: Go vet clean, the touched Go packages' tests pass (except the known Windows-path wranglerasynq tests), Jest 2079/2079,
`ng build` OK. The Dockerfile changes are only proven by the "Publish image" run (`:preview`). **To check on the NAS with
`:preview`:** container starts and the data folders are handed to uid 10001 (watch the first start's logs; DSM may show the
folders owned by an unknown user), a Quick Scan shows products immediately, a PDF and a HEIC receipt still read, an email
import with an HTML body still renders its PDF (Chromium as non-root, sandbox still off). Not done: measuring the latency
before/after (read OCR_PROCESSING / CHAT_COMPLETION durations in the Logs tab), the Chromium sandbox (`CHROMIUM_SANDBOX=true`
needs a NAS test), `--no-install-recommends` for Chromium/ImageMagick.

**Latest (UI-issues one-shot run):** all 17 items in `docs/ui-issues.md` are implemented on `feature/redesign` (CI green, `:preview` re-published). Open: issue 4, shop logos, needs the user's logo.dev key and chain list (monogram stays meanwhile); the About credit line to Receipt Wrangler / Noah Hall was kept as the default; look at every changed page on the NAS in both themes and in Polish (period picker, receipts toolbar, System Settings sections, Quick Scan dialog, shopping lists, donut focus, AI page backup card). Polish strings built in TypeScript templates and group-name page titles may still be English.

**The redesign is on `feature/redesign` (not merged, `:preview` image published for the NAS).** Tailwind + spartan/ui replace
Angular Material and Bootstrap everywhere (`docs/material-removal.md`, `desktop/CLAUDE.md` -> "UI stack"); two themes, White and
Black, on tokens (`docs/themes.md`). Jest (2002 tests) and `ng build` are green locally and CI was green on the last pushes. Still
to look at on the NAS: every page in both themes, phone widths (not prioritised), dialogs and the autocomplete pickers. Merge to
`main` only on the user's go; then tag a release (this is a large UI change, `v0.2.0`). Done since: per-user Dashboard currency, phone-width pass, multi-stage Docker image (green as `:preview`, untested on the NAS), ci.yml tidy, npm audit 0. Polish translation is in (registry, see `desktop/CLAUDE.md` -> Translations; TS-built page titles and dates are still English). Component SCSS is mostly converted (left on purpose: image canvas, carousel, diff table, report config panel and column picker, column configuration, receipt form, badge). `:preview` was republished from `b7f8464f`. Open:
stale Playwright specs (no e2e users locally: the seed script needs Python or jq), remaining component SCSS, remote branch deletion (`scripts/delete-merged-branches.sh`, run by the user).


**`v0.1.0` is released: `feature/theme-modes` was fast-forwarded into `main` (`f29878ef`) and tagged.** CI on `main`
was green; `publish-image.yml` pushes `ghcr.io/wouekk/cartvibe:latest`. Our other `feature/*` branches are
contained in `main` and can be deleted when convenient.

What 0.1.0 holds (see `CHANGELOG.md`): shopping lists with live sync, the Dashboard, receipt products with health and
seasonality tags, receipts attached to lists, the admin AI page (every member may use it), themes (light, dark in dark
gray, five accents; filled buttons, the progress bar, the header and the sidebar avatars follow the accent), the CartVibe
identity and a large animated loading screen, a page that grows into a collapsed sidebar, System Settings in five tabs,
starter reports. System Settings is admin-only again in the menu.

Also done today:
- **Credit and licence:** `LICENSE` (AGPL-3.0), `NOTICE.md` crediting Noah Hall (@Noah231515) and the original project,
  README and project page (`site/`) say it is a vibe-coded fork. Never remove these (see `CLAUDE.md`).
- **Upstream clean-up:** upstream-only workflows, `.idea/` and `tag-version.sh` removed; the 53 upstream branches and
  80 upstream tags were deleted from GitHub with `scripts/remove-upstream-refs.sh`. History is untouched.
- **Cache:** nginx now sends `Cache-Control: no-cache` for the app shell, hashed build files are cached a year. Untested
  locally (no Docker here): if the container ever fails to start, look at `docker/default.conf` first.

**Still to do by the user:** pull `:latest` in Dockhand and redeploy (hard-refresh once, the old page is cached); enable
GitHub Pages (Settings → Pages → Source: GitHub Actions) and re-run the "Project page" workflow, which failed only
because Pages was off.

## Open questions

- **Language (EN / PL):** approach B (a translation library) is decided and waits for the Mac (see the backlog). Still
  unanswered: should the AI answer in one household-wide language (recommended) or in the uploader's language?
- **Per-user display currency (option C):** each person picks a currency and a manual rate; only the Dashboard converts
  its figures in the browser; no API permission changes, two additive preference fields. Parked by the user for later;
  currencies and exchange rates stay under System Settings for now.

## Next

### Claude Code
1. Per-user display currency (when the user asks), Dashboard only first.
2. M3 / F1 are checks, not builds: revisit only if the user finds Manage pages too complex.
3. Tidy `ci.yml`: its upstream-only steps (Codecov, Docker Hub, gated to the original repo) are dead.
4. Stale Playwright specs: only when e2e can run (they need a live API; none ran here).
5. Cut releases with SemVer tags `vX.Y.Z` on `main` after green CI and a `CHANGELOG.md` entry; a preview for the user
   goes out with `gh workflow run publish-image.yml --repo wouekk/cartvibe --ref <branch>` (publishes `:preview`).

### User
- Redeploy `:latest`, enable Pages, answer the language question.
- If not done yet: Manage → AI (Gemini or LM Studio, Save, Test connection); an account for the wife with the role User.

### Cline
- Triage the latest failing CI run, if any: `gh run list --repo wouekk/cartvibe --limit 5`, then
  `gh run view <id> --log-failed`; record findings below.
- Safe polish targets: SCSS in `desktop/src/shopping-lists/`, `desktop/src/overview/`, `desktop/src/receipts/receipt-products/`,
  `desktop/src/standalone/components/food-tags/`, `desktop/src/layout/sidebar/`, `desktop/src/theme/`. Dark mode is a
  filter: author colors for the light page.

## Reminders for a fresh session
- Go is not on the bash PATH here (`export PATH="$PATH:/c/Program Files/Go/bin"`); `api/scripts/go-without-cgo.sh vet ./...`
  and `... test <pkg>` work locally, but the services package's PDF/Chromium/image tests and some wranglerasynq temp-path
  tests fail here only (CI is the judge). No Node, Docker, ImageMagick, Tesseract or Python on this PC.
- `gh` needs `--repo wouekk/cartvibe` (it defaults to upstream). `git` LF/CRLF warnings are harmless.
- Never name anything "Apple" (themes, branches); the user cannot risk a trademark complaint.

## Diagnostics from Cline
- *None yet.*

## Mac backlog (things this Windows PC cannot do: no Node, Docker, ImageMagick or Chromium)

The MacBook may have more toolchains; check (`node -v`, `docker -v`) before assuming. Why the PC is limited: it has only Go,
so anything that needs `npm` (installing a package, regenerating `package-lock.json`) or Docker (building the image) has to
be done by GitHub Actions or on the Mac.

1. **Translation (English / Polish), approach B.** Add a translation library (e.g. `@ngx-translate/core` with its HTTP
   loader, or `@jsverse/transloco`) to `desktop/package.json`; regenerate `package-lock.json` on Node 20.19.6 and gate with
   `npm ci`, `npm run test:ci`, `npm run build` (see `desktop/CLAUDE.md` -> dependency rules). Then: wave 1 = daily screens,
   wave 2 = admin screens; `UserPreferences.language` (additive API field + swagger + both clients); the AI prompts use the
   language setting (and fix the `LOWER()` matching on SQLite, which only folds ASCII: compare in Go for Polish).
2. **Image scan quick wins left over:** `--no-install-recommends` for the apt installs (verify PDF, HEIC and Chromium
   fonts still work) and a multi-stage slim runtime image (drops curl, -dev packages, ssh, the Go toolchain). Needs a real
   Docker build and a NAS test; re-scan with `grype` afterwards.
3. **Playwright e2e specs** (they need a live API): update the stale ones (paid by, shares, statuses, Quick Scan required
   fields, the Added At column, the old System Settings tabs and pencil, the old logo and page title).
4. **Run the Jest suite and `ng build` locally** instead of waiting for CI, once Node is there.

## Upstream clean-up log (2026-10-21)
- Done: `.idea/` untracked, upstream-only workflows (`e2e`, `mobile-e2e`, `release`) and `tag-version.sh` removed, `LICENSE`,
  `NOTICE.md`, `CHANGELOG.md`, `site/` (project page, `pages.yml`) added, README rewritten with credit to Noah Hall.
- Done: `scripts/remove-upstream-refs.sh` was run by the user; the upstream branches and tags are gone from `origin`.

## Repo and image rename (2026-10-21)
The GitHub repository is **`wouekk/cartvibe`** (was `wouekk/receipt-wrangler`; GitHub redirects the old name), the page is
`https://wouekk.github.io/cartvibe/`, and from v0.1.1 the image is **`ghcr.io/wouekk/cartvibe`** (the old
`ghcr.io/wouekk/receipt-wrangler` package stays but is no longer updated). Use `--repo wouekk/cartvibe` with `gh`.
The compose file now maps the NAS folder `/volume2/docker/cartvibe/...` (rename the existing folder first, or the app starts with an empty database); the paths inside the container (`/app/receipt-wrangler-api/...`) and the service names are unchanged on purpose.
After the first publish the new GHCR package may be **private**: set it to public (GitHub → profile → Packages →
cartvibe → Package settings → Change visibility) or the NAS cannot pull it.

## Local stack on the Windows PC (set up 2026-10-21, outside the repo, in `C:\Users\Marcin\tools\`)
Everything needed to run and look at the app without CI or Docker:
- **Node 20.19.6 + npm 10.8.2** (CI's versions), unzipped in `tools\node-v20.19.6-win-x64`; not on the PATH, so put
  `export PATH="/c/Users/Marcin/tools/node-v20.19.6-win-x64:$PATH"` in front. `npm ci`, `npx jest <path>`, `npx ng build`
  (about 35 s) all work in `desktop/`. A lockfile regenerated here must still be checked against CI's `npm ci`.
- **API:** `tools\devstack\api.exe`, built with `bash api/scripts/go-without-cgo.sh build -o <path> .` (image and OCR
  libraries are stubs, so image/PDF/OCR features do not work locally; everything else does). Run it from
  `tools\devstack\run` with `DB_ENGINE=sqlite DB_FILENAME=dev.db ENCRYPTION_KEY=.. SECRET_KEY=.. REDIS_HOST=127.0.0.1
  BASE_PATH=C:/Users/Marcin/tools/devstack/run`; it listens on :8081; login `admin` / `admin`.
- **Redis stand-in:** `tools\devstack\redis\miniredis.exe` (a Go in-memory Redis on :6379; start it first).
- **Web:** `npm start` in `desktop/` serves :4200 and proxies /api to :8081.
- **Screenshots:** `tools\devstack\shot.cjs` (Playwright, Chromium installed) logs in and writes PNGs to `tools\devstack\shots`;
  read them with the Read tool to check light/dark, the sidebar and phone widths (set the viewport) before a preview.
- Not available: Docker (nginx/image paths can only be tested on the NAS), real Redis, ImageMagick/Tesseract.
