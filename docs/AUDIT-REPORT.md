# CartVibe audit report (2026-11-09)

A read-only audit of `main` @ `591dc65f` (v0.18.0): the Go API, the Angular app, the Docker build and the project
site, judged against the mission of a fast, private, self-hosted household spending tracker, receipt scanner and live
shopping list. Findings come from reading the source and from the production build of 5 November 2026. Line numbers
are those of that commit; they drift as the work below lands.

IDs: B = backend, F = frontend, D = deletion, S = security and reliability, C = a project rule to change.

## Decisions (2026-11-10)

The owner approved carrying out everything in this report except S1. Where the report below differs, this table wins.

| Item | Decision | Effect |
|---|---|---|
| S1 default `admin` / `admin` | Dropped | The bootstrap account stays as it is, and the self-service password change proposed with it is not built. The README and FAQ keep "change that password" |
| No hosted plan | Final | CartVibe is self-hosted only. D1 (the cell runtime) is removed, not parked. `docker-compose.vps.yml`, `deploy/vps/` and `docs/vps-deploy.md` stay as an option for anyone who hosts it on their own server |
| D15 identity-provider sign-in | Finish it | Provider buttons on the login page and a Providers tab in System Settings; nothing is deleted |
| C14 roles | Fixed roles only | Admin and Member; everyone in a household sees everything in it. Role editing, grants, paid-by visibility and member isolation are removed |
| B10 report PDFs | Keep Chromium | B10 is dropped; B9 still removes cgo and nginx |
| C8 theme controls | Move to Settings, keep five palettes | The palette menu and day/night switch leave the header |
| C4 `:latest` (decided 2026-11-10, with sprint 6) | Keep it on green `main` | The NAS deploys from `:latest`, so it stays the newest tested commit. Releases get `:vX.Y.Z` and `:X.Y` beside it; the README points other self-hosters at `:X.Y`. B3's "an alias for the newest release" is not done |
| Node (decided 2026-11-10) | Move to Node 26 | CI, the image and the lockfile are on Node 26.13 (the long-term release); the PC has it, the Mac needs it before work there |

## Progress

One branch per sprint. A sprint is ticked when it has reached `main`. Sprints 1 to 4 reached it together on 2026-11-10.

- [x] 1. Quick wins (`feature/audit-quick-wins`): S21, S3, S9, S14, compression, B4, S6, B2.1, S22, B5.1, B5.4, B5.5,
  B5.6, B5.8, sessions, F3, F4, B7, D3 to D5, D12 to D14, part of D17
  - Also done there: S17 (loopback), the 30-day session default with its migration, Dependabot, `go vet`,
    `staticcheck` and `govulncheck` in CI (37 findings fixed on the way), `npm audit` back to 0.
  - Moved to a later sprint: a `context.Context` on the AI clients (B5.4, sprint 7); the one-year session cap and
    "sign out everywhere" (sprint 4); the first-admin result and `PrepareAccessTokenClaims` (D3, D14), the three unused
    npm packages (D13), the 51 empty style files (D4) and `GetReceiptsForGroupIds`, `ChartGrouping`, `LogoutCommand`
    and the router parameters of D17 (sprint 2, with the contract); the wrong-password 500 (D14, with S8 in sprint 6);
    the `GetReceiptImage` 500 (S18, sprint 7).
  - Sprint 6 note: before `pull_request` is added to `ci.yml`, `publish-image.yml` must also require
    `workflow_run.event == 'push'`, or a fork's branch named `main` could publish `:latest`.
- [x] 2. Remove the cell runtime (`feature/remove-cell-runtime`, cut from sprint 1's branch): D1, D2, D16, rest of D17
  - Done on the branch on 2026-11-10: repositories are `NewXRepository(tx)` again; `internal/cell`, `tools/celllint`,
    `CARTVIBE_MODE`, the cell-keyed caches, the twin-cell tests and `api/docs/cell-runtime.md` are gone;
    `GET /api/search` with its nginx limit, `numWorkers`, `ChartGrouping`, `GetReceiptsForGroupIds` and the unused
    router parameters are removed; the multi-database comments describe SQLite.
  - Left as they are, each with a reason: the `LogoutCommand` schema (the contract still documents a body for sign-out;
    only the unused Go type went); the EasyOCR engine value (stored settings may still name it, and it reads as
    Tesseract); `repositories/testing.go` and `utils/testing.go` in the binary (other packages' tests import them).
- [x] 3. Offline shopping list (`feature/offline-list`, cut from sprint 2's branch): F1, and scan progress from F7
  - Done on the branch on 2026-11-10: the lists open from a copy on the device; adds and cross-offs are queued and
    sent in order, an add by a `clientId` the server deduplicates; the list says Live, Reconnecting or Offline with
    the count waiting, marks unsent rows and shows who crossed an item off; the lists read carries an ETag; a Quick
    Scan with no connection keeps its photos and uploads them later; the receipt page hears `RECEIPT_READ` on the
    household's stream instead of polling. F1.0 (the session) was sprint 1; here its expiry check was found to be a
    memoized selector that never noticed the token running out, and fixed.
  - Beyond the plan, found while trying it with the server stopped: a stream that looks open after the signal is
    gone (the heartbeat is now a `PING` event and the page reopens a stream silent for 70 s; a failed send stops the
    page saying Live at once), and the add box keeping a quickly typed name.
  - Left for later, each with a reason: finished lists loaded on demand (F1.6; the ETag already saves the transfer);
    flashing rows someone else changed (F1.5; the avatar covers "who"); queued edits, deletes and whole-list actions
    (each needs its own "safe to send twice" rule on the server first); an idempotency key for a queued Quick Scan
    (a lost answer can make a second receipt); the Dashboard's list preview, which still needs a connection.
- [x] 4. Phone shell and Shop mode (`feature/phone-shell`, cut from sprint 3's branch): F2, F4, F5, F9, C7, C8, C9
  - Done on the branch on 2026-11-10: a tab bar below 768px (Dashboard, Lists, Scan, Receipts, More) with the
    household in the header in place of the sidebar button; the palette menu and day/night switch gone from the
    header (C8); one control height, 36px under a mouse and 44px on a coarse pointer, as a token the helm variants
    and the app's toolbars read (C7, F9); *Interface size* under Settings → Theme instead of a root size tied to the
    window (C9), with a wide screen that never chose starting at the step it had; the list switcher as chips above
    the open list, *Delete list* in the list's menu and a one-row add bar on a phone (F2); Shop mode (the list
    alone, larger rows, the screen kept on; it took over "Keep screen on" and starts after Going shopping); every
    `app-table` as cards on a phone, with sorting in one control, and the receipts list's row buttons as one menu
    (F5); a receipt's product lines as cards with one menu (F4); *Sign out everywhere* under User Settings and a
    session length an admin may set up to a year (F2 sessions).
  - Found on the way and fixed: `POST /logout` left the access cookie in the browser until it ran out.
  - Left for later, each with a reason: grouping a list by aisle (items have no section yet; it comes with "aisle
    order per shop" in sprint 11); on the receipt page, the photo pinned above the lines, the lines to check sorted
    first and one "Looks right" button (F4; that is a redesign of the page around the review, better done with D6's
    two statuses in sprint 10; a line without an amount is marked instead); dialogs as bottom sheets on a phone
    (F9); the Dashboard's own Quick Scan and New list buttons, which stay beside the tab bar's; Playwright on a phone
    (sprint 6 adds the project, so the phone layout has unit specs only).
- [x] 5. Jobs in SQLite, Valkey removed (`feature/sqlite-jobs`, on `main` since 2026-11-10; B2.4 on `feature/sqlite-pools`): B1, B2.2 to B2.4, S10
  - Done on the branch on 2026-11-10: a `jobs` table with one worker (claimed by a conditional UPDATE, retried after
    20 s, 1 min and 3 min, kept as FAILED for the activity list, deleted on success, put back after a restart) runs
    quick scans and household imports; the sweeps and clean-ups are timers that cannot overlap themselves and end
    after 30 minutes; rerun, the source-file preview and the temp sweep read the job's row; `hibiken/asynq`, the
    Valkey connection and `VALKEY_*`, the queue priorities, the task concurrency and the restart-task-server endpoint
    with its permission are gone from the API, the contract and the app; Valkey left both compose files, the README,
    CI and the e2e runner (B1, S10). The database gets a truncating checkpoint and is closed on shutdown (B2.2);
    connections cap the WAL at 64 MB, keep temporary data in memory and get an 8 MB cache, and `PRAGMA optimize`
    runs daily (B2.3).
  - Beyond the plan: the daily tasks counted a whole day from each start, so a server restarted nightly never made
    its daily snapshot or ran its clean-ups; the snapshot now goes by the newest copy's own time and the clean-ups
    run ten minutes after a start.
  - B2.4, on its own branch (`feature/sqlite-pools`, 2026-11-10): the database opens as a writer of one
    connection and eight read-only readers (`repositories/sqlite_pools.go`). The feared hang cannot happen: a
    write outside its transaction by the same goroutine is refused at once by name, and any other wait for the
    writer ends after 30 s. Looking for such writes found none: the whole Go suite runs on the same pools and no
    test trips the refusal (the `services.DeleteUser` tests included, which `db.go` named as using a second
    connection), and a scan of the 56 transaction bodies for calls that do not go through the `tx` came back
    empty. A path no test covers is not proved by that; it now fails by name instead of hanging. Not done from
    B2's text: "readers stop taking the write lock at BEGIN" (a transaction cannot say it will only read; such
    code still takes the writer).
  - Left as they are: the `task_queue_configurations` table and the `task_concurrency` column in existing
    databases (migrations are additive), and the column name `asynq_task_id` behind `SystemTask.JobId`.
- [ ] 6. Releases, CI and hardening (`feature/sprint-6-releases-ci`; the first four items were made on
  `feature/releases-and-ci` in another session and merged in): B3, B7, B8, S4, S8, S12, S13, S16, S19, S20
  - Done on the branch on 2026-11-10. Sign-in backs off per account and a refused one answers 401 (S8); a new
    install refuses an `ENCRYPTION_KEY` under 32 characters (S12); CSP reports reach the log (S13); the refresh
    cookie is scoped to `/api/token` (S20). The API runs as root only with `ALLOW_ROOT=1`, a folder that refuses
    its user stops the start, the About page tells an admin, and both compose files set `no-new-privileges` and
    keep seven capabilities (S4). The log file is JSON lines capped at 10 MB with one older file (S16). A `v*` tag
    publishes `:vX.Y.Z` and `:X.Y`; the one version number is the tag (`package.json` and `swagger.yml` are
    `0.0.0`); a release's database (`testdata/schema-v0.18.0.sql`) is migrated by today's code in a test (B3). An
    image is scanned before it is pushed, with one rebuild without the cache for a fixable critical finding (S19).
    CI: the race detector on the concurrent packages (the whole suite under it ran past 25 minutes), `check:traps` (the guide's traps as checks, with two counts that only go
    down), a test that the router and `swagger.yml` name the same routes, a coverage floor for the app, a phone
    spec in Chromium and WebKit, and runs for a pull request from a fork (B8).
  - Not done, on purpose. Base images are not pinned by digest (B7): the weekly rebuild without the cache takes
    patched bases by itself, and a pin would trade that for a weekly pull request someone has to merge. The app
    is still built once per job (B8, "build once and pass artifacts"): the image must build from source by
    itself, as the publish does, and the layer cache already makes the second build cheap. No cache mounts in the
    Dockerfile (B7): the gha layer cache covers the dependency layers. arm64 waits for B9.
  - `:latest` stays on green `main` (the decisions table).
- [ ] 7. AI and files (`feature/ai-and-files`, cut from sprint 6's branch): B5.2, B5.3, B5.5, B5.6, B5.7, B6, S18
  - Done on the branch on 2026-11-10. A receipt read and a product read carry a JSON Schema of the answer, sent
    through each provider's own setting, with one retry without it for a model that answers 400 and a memory of
    that until the restart (B5.2). Claude is asked at low effort (B5.3). Ollama is a provider on the AI page with
    a context size sent as `num_ctx`, and a URL that names only the server gets `/api/chat` (B5.5). Tesseract
    reads in the five languages the app ships in (B5.6). Token counts are kept per day, provider and model, and
    the AI page totals two months (B5.7). A receipt image is served as a cached JPEG file from a stored copy
    (display and thumbnail), the receipt page uses it, and an unknown image id answers the 403 of a refusal in
    every image handler; an upload is capped by the API itself (B6, S18).
  - Not verified against a live provider: no key is available here, so the structured settings are proved against
    fake servers only. The retry without them is what keeps a provider that refuses one from failing reads.
  - Left for sprint 11 (its own item there): storing files by id only.
- [ ] 8. Fixed roles: C14
- [ ] 9. Identity-provider screens: D15
- [ ] 10. App cleanup: C10, C11, C13, D6 to D11, F6, F8
- [ ] 11 onward. B9, id-only file paths, money as integers, a generated contract, aisle order per shop, C12

---

How to read it:

- Every finding cites `path:line`. Paths are relative to the repository root.
- **[check]** marks the one claim that needs a command on a running container to confirm.
- IDs (B = backend, F = frontend, D = deletion, S = security/reliability) are reused in the roadmap.

What was audited, by size (tracked files, counted today):

| Part | Code | Tests |
|---|---|---|
| Go API (`api/`) | 451 files, 59,063 lines | 305 files, 72,000 lines |
| Angular app (`desktop/src`, without the generated client) | 696 `.ts` files, 49,252 lines; 203 components | 345 spec files, 37,894 lines; 42 Playwright specs |
| Generated client (`desktop/src/open-api`) | 191 files, 22,079 lines | n/a |
| Contract (`api/swagger.yml`) | 8,623 lines, written by hand | n/a |

The codebase is in better shape than most forks of this age: the app is zoneless, signals and the new control flow are
used almost everywhere, the image build proves its own runtime (`docker/checks/runtime-check.sh`), the reporting engine
has fuzz tests, and the docs say plainly what is unfinished. The findings below are about where it still carries weight
it does not need, and where the phone-in-the-shop job is not yet served.

---

## 1. Executive summary: the five highest-leverage upgrades

**1. Make the shopping list work without a signal.** It is the core in-shop job and today it is online-only. The list
state is deliberately not persisted (`desktop/src/app/app.config.ts:51-52`,
`desktop/src/store/shopping-list.state.ts:45`), the service worker caches the shell only
(`desktop/ngsw-config.json:14-30`), a tick made with no signal is rolled back with an error toast
(`desktop/src/shopping-lists/shopping-list/shopping-list.component.ts:116-139`), and the page itself says so: "You are
offline. Changes you make now may not be saved." (`shopping-lists-page.component.html:33-42`). Worse, reopening the
installed app in a supermarket dead zone signs you out: any failed token refresh, a lost connection included, logs out
and clears local storage (`desktop/src/services/token-refresh.service.ts:30-35`, called at every start by
`app-init.service.ts:28-38`). Proposal F1; the sign-out part is S21 and is a quick fix.

**2. Make upgrades and backups safe without manual discipline.** Every boot runs `AutoMigrate` over 47 models
(`api/internal/repositories/db.go:161-219`) with no snapshot first; the only backup procedure is "stop the stack, copy
the folder" (`README.md:115-117`, `docs/faq.md:148-154`), which a scheduled Hyper Backup cannot do; and the NAS follows
`:latest` with `pull_policy: always` (`docker-compose.yml:6-8`), which is every green commit on `main`, not a release
(`.github/workflows/publish-image.yml:56-60`, against `README.md:39`). No test upgrades a database from an earlier
release. Proposals B2, B3.

**3. Collapse the runtime to what one household needs.** Valkey is used by asynq only, and eight of the ten task types
are timers, the busiest of which then claim their rows from SQLite (`api/internal/jobs/clean_up.go:14-84`,
`api/internal/repositories/claim_due.go:18-56`); yet the API refuses to boot without it (`api/main.go:70-73`). nginx plus
a bash supervisor sit in front of one Go process, and three of the bugs in section 6 live in that seam. cgo is needed by
three files only. Proposals B1, B9, B10 take it to one container and, later, one process.

**4. Rebuild the phone shell around the two in-shop jobs.** Navigation is a sheet behind a top-left button
(`desktop/src/layout/header/header.component.html:7`); two of the four always-visible header controls are the palette
menu and the day/night switch (`:52-75`); the list switcher sits below the items
(`shopping-lists-page.component.html:165-203`); every list page and the receipt line review are sideways-scrolling
tables (`desktop/src/table/table/table.component.html:1`, `receipt-products.component.html:15-30`); controls are 36 px
(`DESIGN.md:34`). Proposals F2 to F5, F9.

**5. Delete what the product has stopped being.** The parked hosted-plan scaffolding alone is 859 `ImplicitCell()` call
sites in 181 files. Add the multi-database portability code and comments, five receipt statuses mapped down to two, a
twelve-flag Quick Scan settings matrix and ten authorization tables behind a UI that offers two roles. Section 5.

Found on the way, all small to fix and all verified (details in section 6):

- a dropped connection signs the user out and wipes their settings (S21);
- the production bundle runs NGXS in development mode with Redux DevTools on (S3);
- the sign-up rate limit never matches the real route (S9);
- `docker stop` kills the API before its own shutdown code can run (S5);
- the AI's answer can set fields the prompt never asked for (S7);
- a later push to `main` can publish an image whose tests never ran (S6);
- a fresh install ships `admin` / `admin` with no forced change (S1);
- 15 hashed chunks miss the immutable cache rule (S14).

---

## 2. Sacred cows to challenge

Each entry: the rule, why it costs more than it gives, the change, and what the change costs.

**C1. "Background jobs need Valkey"** (`AGENTS.md:60`, `api/CLAUDE.md:195`).
The durable state of the work is already in SQLite (attempt counters, `next_attempt_at`, leases); Valkey holds a timer
and two payload types. It adds a container, a boot dependency for the shopping list, a password and health check in the
VPS stack, and a volume. Change: B1. Cost: about 200 lines of own queue code and its tests instead of a library.

**C2. "Repositories take a `cell.Handle`"** (`api/CLAUDE.md:31`; parked in `HANDOFF.md:40`,
`api/docs/cell-runtime.md:10-13`).
It is groundwork for a hosted plan that was cancelled on 2026-11-02. It leaves 859 `repositories.ImplicitCell()` calls
in 181 files, a `CARTVIBE_MODE` switch whose other two values stop the boot (`api/main.go:44-53`), its own linter module
(`api/tools/celllint/`), and twin-cell tests. Change: remove it (D1). Cost: a mechanical change across 181 files; if the
hosted plan ever returns it is rebuilt from git history.

**C3. "AutoMigrate plus additive columns; back up by hand before a schema release"** (`api/CLAUDE.md:42`,
`AGENTS.md:63-64`).
The rule is sound; relying on a person to stop the stack and copy a folder is not. Change: B2 (snapshot automatically
before migrating and every night). Cost: disk space for a few copies of a small database.

**C4. "`:latest` from green `main`"** (`AGENTS.md:58-59`).
It makes every merge a release and gives no version to roll back to; the image's `VERSION` is a commit hash
(`publish-image.yml:122-124`) while the changelog speaks in SemVer. Change: B3. Cost: one more trigger in the workflow
and a tag to type on the NAS.

**C5. "Hardening, keep all of it"** (`AGENTS.md:51`).
Keep it, but two parts fail open on the main target platform: the API silently runs as root when the NAS folder refuses
uid 10001 (`docker/entrypoint.sh:23-28`), and Chromium runs without its sandbox by default
(`api/internal/env/config.go:74-85`, `HANDOFF.md:38`). Change: S4, and B10 questions whether Chromium belongs in the
image at all. Cost: a first start that refuses to run until `PUID`/`PGID` are set, unless an explicit opt-out is given.

**C6. cgo bindings for ImageMagick and Tesseract** (`api/CLAUDE.md:17-18`).
They are why the server cannot be built on the Windows PC, why `scripts/go-without-cgo.sh` and `api/docs/sandbox.md`
exist, why the build stage installs `-dev` libraries in "by far the slowest layer" (`docker/Dockerfile:30-33`), and why
the image is amd64 only. Production uses them in three files: `api/main.go:25,89-90`,
`api/internal/repositories/files.go:223-380`, `api/internal/services/ocr.go:94-216`. The `magick` and `tesseract`
commands are already in the runtime image (`docker/checks/runtime-check.sh:26,36`). Change: B9. Cost: one process start
per image, and temp files instead of stdin because the policy forbids `-` (`docker/imagemagick/policy.xml:55`).

**C7. "One control height: 36 px"** (`DESIGN.md:34`).
It reads well on a desktop and is below both platform touch guidelines (44 pt, 48 dp) on the device the app is "used
mostly" on. The row menu button beside each list item is 36 px (`shopping-list-item.component.html:25-34`), and the
line review puts three 36 px icon buttons side by side, the red delete next to edit
(`receipt-products.component.html:108-135`). The component that matters most already broke the rule by hand with
`min-h-10` inputs (`:37,52,62`). Change: F9, 44 px on coarse pointers through one token. Cost: denser screens get a
little taller on phones only.

**C8. "Palette menu and day/night switch in the header"** (`DESIGN.md:21`), and five palettes.
They take two of four header slots on a phone for something set once. Each UI change must also be checked in Day and
Night, in Zinc plus an accent (`DESIGN.md:93`). Change: move both to Settings → Theme (which already exists) and consider
keeping Zinc plus one accent. Cost: two more taps to switch theme; less personalisation if palettes go.

**C9. "Wide screens scale the root font with the window"** (`DESIGN.md:32`, `desktop/src/tailwind.css:137-141`).
`font-size: calc(100vw / 120)` makes the size a function of viewport width, so between 1920 and 3840 CSS px browser zoom
does nothing (zooming shrinks the viewport by the same factor) and the reader's default font size is ignored. That
fails WCAG 1.4.4 on exactly the screens it targets. Change: a "Interface size" choice in Settings → Theme stored per
browser like the palette (`html { font-size: 125% }`), or simply browser zoom, which browsers remember per site. Cost:
the 4K screen needs one setting once.

**C10. "Lucide through `<app-icon name="material_name">`"** (`DESIGN.md:17`).
Templates name Material icons for a Lucide set, through a 336-entry map that ships in the first bundle
(`desktop/src/shared-ui/icon/icon-map.ts`). The sidebar already names Lucide icons directly
(`sidebar.component.html:44,56,90`), so two idioms coexist. Change: name Lucide icons directly and register only what a
component uses; keep a small server-side map for stored group icons. Cost: a codemod over the templates.

**C11. "Spartan wrappers keep the app's API"** (`desktop/CLAUDE.md:37`).
The kept API is Material's vocabulary after Material was banned: 306 `mat*` identifiers remain in non-test code (90
`matButtonType`, 83 `matColumnDef`, 60 `matDialog`, 34 `matDialogRef`, 20 `matRaisedButton`), and templates use
`<app-button>` 88 times and `hlmBtn` 72 times for the same thing, sometimes in one file
(`header.component.html:29-35` against `:52-75`). Change: one button idiom (`hlmBtn`), rename the inputs
(`variant`, `columnDef`, `dialog`). Cost: a codemod and spec updates.

**C12. "State: NGXS"** (`desktop/CLAUDE.md:29`).
With 228 `signal()`, 294 `computed()` and about 400 signal inputs in the app, NGXS mostly holds paging and filter state (8 of
16 states are `*TableState`) plus auth and groups. It brings three packages, the storage plugin's "defaults never run
for a hydrated slice" trap (`desktop/CLAUDE.md:123-125`), a CSP workaround (`app.config.ts:106-107`), and the dev-mode
bug in S3. Change (Phase 3): signal stores, one small persistence helper. Cost: a large refactor (230 `subscribe`
calls); do it only together with F1, which needs a real persistence layer anyway.

**C13. "Most components are still `standalone: false`"** (`desktop/CLAUDE.md:27`).
122 of 203 components, in 45 NgModules. It is the cause of the "a provider in a lazy module is invisible to dialogs"
trap (`desktop/CLAUDE.md:43-44`) and keeps routes on `loadChildren`. Change: Angular's standalone migration schematic.
Cost: a wide but automated diff; specs that import modules need touching.

**C14. The authorization model** (`api/CLAUDE.md:75-115`, `api/docs/authorization.md`; "Only Admin and User roles are
offered", `AGENTS.md:18`).
Seven seeded roles, a permission registry with wildcards, role ceilings intersected with member grants, paid-by
visibility, member isolation, report-template grants, fail-closed flags: ten tables
(`api/internal/repositories/db.go:170-171,178-182,184-185,197`) and, by file name alone, 2,271 lines of code and 5,194
of tests, guarded by 14 of the 42 Playwright specs. The role editor is gone from the UI, and the web app never calls
the endpoints that create, change or delete a role. This is the part of the code where a mistake is a privacy bug, and
it is sized for a company.
Change (Phase 3): three fixed roles (Admin, Member, and if wanted a limited "Child") with capabilities in code; keep
per-member category hiding only if the household uses it. Cost: a data migration and a careful removal; you lose
per-role tuning nobody can reach from the UI today.

**C15. The guides as the enforcement mechanism** (`CLAUDE.md`, `api/CLAUDE.md` 281 lines, `desktop/CLAUDE.md` 182 lines).
Dozens of "traps" are held by prose and by whoever reads it. There is no linter for either language in CI
(`.github/workflows/ci.yml:51-130` runs build and tests only; `desktop/package.json:4-27` has no lint script). Three
guide claims about CI are already untrue (D12). Change: turn the top traps into checks like `i18n:check` (B8). Cost: a
few small scripts.

**C16. Receipt photos as base64 inside JSON** (upstream design, `api/internal/handlers/receipt_image.go:104-161`).
Every view downloads the original through JSON, 33% larger, uncacheable, and a HEIC or PDF is converted again on every
read (`api/internal/repositories/files.go:88-106`). Change: B6. Cost: a new endpoint and a one-time thumbnail backfill.

---

## 3. Backend and infrastructure proposals

### B1. Jobs without Valkey

Evidence: the only Redis consumers are asynq's client, server, scheduler and inspector
(`api/internal/repositories/valkey.go:14-27`, `jobs/asynq_server.go:13-64`, `jobs/asynq_scheduler.go:11-32`,
`jobs/inspector.go:8-15`). The mux has ten task types (`asynq_server.go:66-80`); eight are scheduled with a nil payload
(`clean_up.go:25-81`) and re-registered from scratch at every boot (`clean_up.go:23`). Only `QuickScan` and
`BackupImport` carry work, and the import already keeps its own job row (`BackupImportJob`, `db.go:215`).

Valkey is also read as a database in three places, all for Quick Scan, and each is simpler as a SQL query: the temp-file
sweep lists every queued task to learn which uploads are still needed (`jobs/temp_file_cleanup_handler.go:87-126`), the
activity log reads the upload's path back out of the task payload to preview or download it (`jobs/source_file.go`),
and "run again" re-queues through the inspector (`handlers/system_task.go:210-240`). The worker opens that path without
the containment check the guide requires for it (`services/receipts.go:332`, against `api/CLAUDE.md:68-70`).

Proposal:
1. A `jobs` table (`kind`, `payload`, `status`, `attempts`, `next_attempt_at`, `last_error`), claimed with the existing
   `claimDue` (conditional UPDATE plus lease). Quick Scan inserts a row and wakes a worker over a channel.
2. Sweeps become `time.Ticker` loops with a "still running" guard (replacing `asynq.Unique`) and
   `context.WithTimeout(30 * time.Minute)` (replacing `asynq.Timeout`, `task_enqueue.go:24-29`).
3. Remove `hibiken/asynq`, the `valkey` service from both compose files, `VALKEY_*`, `TaskQueueConfiguration`, the queue
   priority settings and the "restart task server" endpoint (`handlers/system_settings.go:138-150`).

Trade-offs: you own retry and backoff (attempts plus `next_attempt_at`, the pattern the sweeps already use); a few more
small writes to SQLite; jobs waiting in Valkey at upgrade time are lost, which the Redis-to-Valkey move already accepted
(`docker-compose.yml:45-46`). Local development no longer needs miniredis.

### B2. SQLite: snapshots, shutdown, pools

What is there is right: WAL, `busy_timeout` 5 s, `synchronous(NORMAL)`, foreign keys, `_txlock=immediate`, a pool of 8
(`db.go:75-116`), on a pure-Go driver (`db.go:15`). What is missing:

1. **Automatic snapshots.** `VACUUM INTO 'sqlite/backups/app-<stamp>.db'` (a) before `MakeMigrations` whenever the
   running version differs from the last one that booted, and (b) nightly, keeping for example 7 daily and 4 weekly.
   One consistent file that Hyper Backup can copy while the app runs. Show "last snapshot" and a download button under
   System Settings → Export & import. No such code exists today (no `VACUUM`, backup API or checkpoint anywhere in
   `api/`).
2. **Close the database on shutdown** with `PRAGMA wal_checkpoint(TRUNCATE)`. Today it is never closed
   (`api/main.go:113-124`), so a stopped-container copy still depends on the `-wal` file.
3. **Pragmas:** add `journal_size_limit` (bounds the WAL), `temp_store(MEMORY)`, a `cache_size`, and `PRAGMA optimize`
   on a daily tick.
4. **One writer pool, one reader pool.** A writer pool of one connection makes Go queue the writers, so the
   "fails after 5 s" class (`api/CLAUDE.md:55-56`) disappears, and readers stop taking the write lock at `BEGIN`.
   Prerequisite: fix the services that open a second connection inside a transaction, which `db.go:91-94` admits to.

Trade-offs: a snapshot needs free space the size of the database; the pool split is a real refactor and belongs after
the snapshot work.

### B3. Releases you can pin and roll back

- Publish `:vX.Y.Z` (and `:X.Y`) when a `v*` tag is pushed, with `VERSION=vX.Y.Z`; keep `:latest` as an alias for the
  newest release, not the newest commit (`publish-image.yml:11-25,119-124`). The About page then shows a real version.
- Root compose pins a minor tag; `README.md:39` becomes true.
- Add an upgrade test: keep a small schema dump per release under `api/internal/repositories/testdata/` and assert that
  `migrateSchema` plus `RunDataMigrations` bring it to the current shape. No database fixture exists today
  (`git ls-files` has no `.db` or schema dump).
- One version number: `desktop/package.json:3` says 1.3.0, `api/swagger.yml:10` says 5.0.0, the tag says 0.18.0.

### B4. Shutdown path

- `docker/entrypoint.sh:34-44`: the `TERM` trap signals the children, `wait -n` returns at once, and `exit $?` ends
  PID 1, so the kernel kills the API a moment after it gets the signal, with its shutdown code barely started. Fix:
  after the first `wait -n`, signal both children and `wait` for them; add `stop_grace_period: 30s` to compose.
- `api/main.go:113-124`: jobs are stopped first while HTTP still accepts work; then `Shutdown` is given 5 s, which an
  open shopping-list stream never lets it meet (`handlers/shopping_list_stream.go:106-141` only ends on client close, a
  dropped subscriber or the 15-minute lifetime), and the timeout is logged as `FATAL`, which is `os.Exit(1)`
  (`logging/log.go:50-54`). Fix: stop HTTP intake first, cancel streams through `RegisterOnShutdown`, log a timeout as
  an error.
- `api/main.go:130`: listen on `127.0.0.1:8081`; nginx is in the same container, and `0.0.0.0` bypasses it under
  `network_mode: host`.

### B5. AI pipeline

Prompt: short and well shaped (`api/internal/services/receipt_prompt.go:9-23`). The weak points are around it.

1. **Parse into a narrow type.** The answer is unmarshalled straight into the REST command
   (`services/receipt_processing.go:223`, `commands/upsert_receipt_command.go:14-32`), and Quick Scan keeps an
   AI-supplied payer, status and comments (`services/receipts.go:402-408,457-469`; the comment there still cites custom
   prompts, which were removed). A hallucination or text printed on a PDF can set them. Use a struct with the six
   prompted fields plus products, then map. This also deletes `dropAiTags`. Two tests pin the old behaviour and change
   with it (`TestQuickScan_KeepsAiPaidByAndStatusWhenPresent`, `TestQuickScan_AppendsUserCommentToAiComment`).
2. **Use each provider's schema mode, not three text repairs.** Today: `json_object` for OpenAI
   (`ai/open_ai.go:105-109`), a MIME type without a schema for Gemini (`ai/gemini.go:83-85`), `format: "json"` for
   Ollama (`ai/ollama.go:41-43`), free text for Claude; then `cleanResponse`, `stripTrailingCommas` and `stripJsonFence`
   (`receipt_processing.go:238-297`, `ai/anthropic.go:133-145`). Each provider accepts a JSON schema now: OpenAI
   `json_schema` (strict), Gemini `ResponseSchema`, Ollama `format` with a schema, Claude `output_config.format`. The
   comment "Claude has no JSON-only switch" (`anthropic.go:133-134`) is out of date. Keep the fallback shape
   `gemini.go:88-93` already uses: on a 400, retry once without the extra parameter, because the model is user-chosen.
3. **Claude: ask for less thinking.** The call sends no effort (`anthropic.go:99-103`), so current models think at
   their default depth for a six-field extraction. Send `output_config.effort: "low"` with the same one-retry fallback.
   Not sending `temperature` is correct for current models.
4. **Timeouts.** One call may take 10 minutes (`constants/http.go:15`) and scans run one at a time
   (`jobs/quick_scan_handler.go:32`), so a hung provider blocks every scan, twice with a fallback configured. Use about
   120 s for cloud providers and keep the long limit for local models only. Give `Client.GetChatCompletion` a
   `context.Context` (`ai/ai_client.go:7-9`; `anthropic.go:99` and `gemini.go:43` use `context.Background()`), so a
   shutdown or a task timeout can cancel it.
5. **Local models (Ollama).**
   - The HTTP status is never checked and the error body is ignored (`ai/ollama.go:62-79`), so "model not found" becomes
     an empty answer and then "unreadable"; `:81` is a condition that is always true.
   - No `num_ctx` is sent (`:37`); Ollama's default context is a few thousand tokens, so a long receipt plus the
     category list is cut silently. Add it, with a "Context size" field on the AI page.
   - The URL is used as typed (`api/CLAUDE.md:213`); offer "Ollama" as a host-only field and append `/api/chat`.
6. **OCR for text-only models.**
   - Only English data is installed and no language is set (`docker/Dockerfile:69`, `services/ocr.go:95`), in an app
     shipped in Polish, French, German and Spanish. Install `tesseract-ocr-{pol,fra,deu,spa}` and pass the household's
     languages.
   - The character blacklist removes `-`, `/`, `:`, `%`, `$` (`ocr.go:98`): dates, times, discounts and VAT rates lose
     their separators before the model sees them. Shrink it to real noise.
   - A failure to set that variable returns an empty text and no error (`ocr.go:99-101`).
   - CI's ImageMagick policy is Debian's with PDF switched on (`api/set-up-dependencies.sh:24-27`), not the shipped
     `docker/imagemagick/policy.xml`, so Go tests never run under the production limits.
7. **Record what a call cost.** No token count is read from any provider. The FAQ tells people to pick the cheapest
   model that works (`docs/faq.md:61-80`), and the app cannot show what a month of receipts used. Store input and
   output tokens per call and total them on the AI page.
8. **Keep the provider's error.** On a failed call the task log is built from a variable that is still empty
   (`services/ai.go:62-70`), so the provider's own error body, which the clients do return, is dropped.

### B6. Receipt files

- Serve images as bytes: `GET /receiptImage/{id}/file?w=…` with `Cache-Control: private, max-age=31536000, immutable`
  and an ETag, used as a plain `<img src>` (same-origin cookies already authenticate it). Make a display JPEG and a
  thumbnail once at upload instead of converting on every read (`files.go:88-106`).
- Store by id only. The path is `data/<groupId>-<groupName>/<receiptId>-<fileId>-<uploaded file name>`
  (`files.go:37-86`): two queries per file, a folder move inside the rename transaction, and the reason every path helper
  re-asserts containment (`api/CLAUDE.md:62-70`). `data/<groupId>/<fileId>` removes the class. Cost: one data
  migration that renames folders, and File Station no longer shows household names.
- Three small bugs in `handlers/receipt_image.go`: `UploadReceiptImage` carries on after each of three error
  responses and then defers `Close` on a file that may be nil (`:25-42`); `RemoveReceiptImage` does not return after its
  first error response (`:209-212`); `GetReceiptImage` answers 500 for an unknown id before authorization (`:110-114`),
  where the guide promises the same 403 (`api/CLAUDE.md:80-83`). Upload size is capped by nginx only (`:44` is a
  `TODO: Validate size`).

### B7. Docker build

| Where | Finding | Change |
|---|---|---|
| repo root | No `.dockerignore`; the context is `.` | Add one (`node_modules`, `dist`, `.git`, `coverage`, `docs`, `site`) |
| `docker/Dockerfile:81` | Copies the whole build directory into the runtime image: all Go source, tests, `swagger.yml`, dev scripts, `api/entrypoint.sh`. The header (`:1-2`) says "only what runs" | Copy the binary only; locales and brands are embedded (`i18n/i18n.go:21`, `shoplogos/brands.go:24`) |
| `docker/Dockerfile:103` | `COPY docker/ .` puts the Dockerfile, checks and policy in the image a second time | Drop it; `:104,106` already copy the two files used |
| `api/set-up-dependencies.sh:21` | Installs Chromium in the build stage, where nothing uses it; the script has no `set -e` and installs before `apt-get update` (`:2-3`) | Split into build and test dependency scripts, with `set -eu` |
| `docker/Dockerfile:39` | Plain `go build` | `-trimpath -ldflags "-s -w"`, and cache mounts for the Go and npm caches |
| `docker/Dockerfile:11,25,46,54` | Base images by tag | Pin digests; let Dependabot move them |
| `docker/default.conf` (whole file) | No `gzip` directive, and `/etc/nginx/nginx.conf` is Debian's stock file, which compresses `text/html` only. The first load is about 1.5 MB of JavaScript (368 KB gzipped), the service worker then fetches all 3.0 MB, and each language file is about 120 KB. **[check]** request one `main-….js` with `curl -sI -H 'Accept-Encoding: gzip'` and look for `Content-Encoding` | `gzip_types` for js, css, json, svg; or precompressed files |
| `docker/default.conf:219` | The immutable rule expects `[A-Z0-9]{8}`; esbuild hashes also use `_` and `-`. In the 5 Nov build 15 of 43 hashed chunks miss it (for example `chunk-_H_hYCWH.js`, `chunk-D-OImBFH.js`) | `[A-Za-z0-9_-]{8}`; add `/media/*.woff2` |
| `publish-image.yml:117` | amd64 only | arm64 becomes cheap after B9 (no cgo, no QEMU compile) |

### B8. CI and operability

- **Publish gate (S6).** On `main` the change filter compares with the previous push, and each test job is skipped when
  its area did not change (`ci.yml:26-49,53,82,137`). A skipped job counts as success, and `publish-image.yml:37` only
  asks for success. A red API commit followed by a desktop-only push publishes `:latest` with the API tests never
  re-run. Fix: on `main`, run every job.
- **Missing checks.** No `go vet`, no static analysis, no `-race`, no `govulncheck`, no `npm audit`
  (`ci.yml:63-78,89-98`). A test comment relies on `-race` in CI (`api/internal/oidc/provider_cache_test.go:113`) and the
  guide relies on `govulncheck` (`api/CLAUDE.md:11-13`). `staticcheck` alone would have found D3 and the always-true
  condition in B5.5.
- **Untested paths that matter.** Go test coverage is broad (more test lines than code, fuzzing in the reporting
  engine, a concurrent-writers test for SQLite), so the gaps are specific:
  - upgrading a database made by an earlier release (B3): the data-migration ledger is tested, `AutoMigrate` on old
    tables is not;
  - OCR itself: `ReadImageWithTesseract` and `prepareImage` (`services/ocr.go:94-216`) have no test, so the language and
    blacklist problems in B5.6 were never visible; they need cgo today and become plain golden-file tests after B9;
  - an Ollama error answer: the five tests in `ai/ollama_test.go` cover success, malformed JSON and connection errors,
    not a non-200 status with an error body (B5.5);
  - shutdown (B4) and a failed token refresh while offline (S21);
  - the web app's coverage gate is 1% (`desktop/angular.json:192-197`); Go coverage is computed and discarded
    (`ci.yml:71`).
- **Smoke set.** CI runs 5 of 42 specs (`desktop/package.json:23`): none touches a shopping list, a scan or a receipt.
  The stated reason is the login rate limit (`ci.yml:134`), but specs already reuse a stored session
  (`desktop/playwright.config.ts:28,46`). Add `shopping-list.spec`, `quick-scan-dialog.spec`, `receipts.spec`.
- **Phones are not tested.** Every Playwright project is "Desktop Chrome" (`playwright.config.ts:28,34,45`). Add a
  `Pixel 7` project for the list and scan specs, and a WebKit project as the closest thing to iOS Safari.
- **Speed.** `test-api` reinstalls ImageMagick, Tesseract and Chromium on every run with no cache (`ci.yml:55-62`); the
  Angular app is built five times across `ci.yml:101-123`, `pages.yml` and the image. Build once and pass artifacts.
- **No Dependabot or Renovate** (`.github/` holds workflows and one issue template). Weekly grouped updates for Go, npm,
  Actions and Docker would replace the manual pinning.
- **External pull requests get no CI** (`ci.yml:4-14` has no `pull_request`), while `CONTRIBUTING.md:18` asks for green.
- **Trap checks (C15).** Small scripts in the style of `i18n:check`: no `environment.development` import outside
  `angular.json`; no string concatenation in `[attr.aria-label]`; the counts of `standalone: false` and `mat*`
  identifiers may only go down; every chi route exists in `swagger.yml` and the reverse (`chi.Walk`).
- **Logs.** `logs/app.log` is appended forever (`logging/log.go:26`) and parsed back with regexes for the log viewer
  (`services/app_log.go:28-29`). Move to `log/slog` JSON lines with a size cap; the viewer then reads fields.

### B9. Bold: one process, no cgo, no nginx

1. Replace the three cgo call sites with `magick` and `tesseract` commands (C6). The build becomes `CGO_ENABLED=0`: it
   compiles on Windows, cross-compiles to arm64, and a decoder crash kills a child process instead of the API.
2. Let Go serve the built app and the headers. That removes nginx, the bash supervisor (B4), the 227-line
   `default.conf`, the CSP hash that must match between `index.html` and the nginx file
   (`desktop/tools/check-csp-hash.cjs`, `Dockerfile:20-22`), body-size limits defined twice (`default.conf:125` and the
   API's own cap), and the route-name mismatch class (S9). Rate limits move into Go, keyed by client and by user name.

Trade-offs: nginx is a proven shield for slow clients; Go needs explicit read, header and idle timeouts and a
trusted-proxy rule for `X-Forwarded-For`. An unprivileged process can bind port 80 inside a container on Docker 20.10
and later, so users' compose files would not change; confirm on the NAS's Docker version first.

### B10. Bold: no Chromium

Chromium is in the image only to print report HTML to PDF (`api/internal/services/html_to_pdf.go`, 24 `chromedp` calls;
`runtime-check.sh:62-78`), runs unsandboxed by default, and is very likely the largest package in the runtime layer
(`docker history` will say). Options: (a)
the browser prints the same HTML with a print stylesheet, so the server sends no PDF; (b) a pure-Go PDF writer for the
tabular reports. Trade-offs: (a) loses server-made PDFs and exact page footers, and printing to PDF on a phone is
clumsier; (b) loses HTML fidelity. Measure first how often PDF is chosen over CSV and Excel.

---

## 4. Frontend, UX and visual design proposals

### F1. Offline-first shopping list

0. **Let the session survive being offline (S21).** Today "signed in" means "the 20-minute token has not expired"
   (`store/auth.state.ts:41-58`), and a refresh that cannot reach the server signs the user out
   (`services/token-refresh.service.ts:30-35`; also fired every 15 minutes by `app/app.component.ts:39-50` and by
   `guards/auth.guard.ts:48-52`). Sign out only when the server answers 401 or 403; on a network error or a 5xx keep
   the session and retry when the connection returns. Nothing below works until this does.
1. **Persist the lists** (IndexedDB, keyed by household) and render from that copy at once; refresh when the network
   answers.
2. **Outbox for changes.** Ticking is already an idempotent "set" on the API
   (`api/internal/repositories/shopping_lists.go:222`), so replay is safe. Adding is not: the server allows two lines of
   the same name (`api/internal/services/shopping_lists.go:112-114`). Add a client-generated `clientId` column, unique
   per list (an additive migration), so a retried add cannot duplicate.
3. **Make adding optimistic too.** Today the add box waits for the server (`shopping-list.component.ts:82-110`).
4. **Honest status.** The stream service knows whether it is live or reconnecting and exposes nothing
   (`desktop/src/services/shopping-list-stream.service.ts:97-111`); the banner uses `navigator.onLine`, which its own
   comment calls unreliable (`online-status.service.ts:4-5`). Show one small state by the list name: Live,
   Reconnecting, or "Offline · 3 changes waiting", and a dot on rows not yet sent.
5. **Show the family.** Rows already carry `checkedByUserId` (`api/internal/models/shopping_list_item.go:43`); show that
   person's avatar on a just-ticked row and flash rows changed by someone else.
6. **Cheaper refresh.** Every reconnect and every return to the tab refetches all lists with all items, finished lists
   included (`shopping-list-stream.service.ts:45-54,136-140`, `repositories/shopping_lists.go:39-58`). Send an ETag and
   answer 304, and load finished lists on demand.
7. **Queue scans as well.** Keep a Quick Scan photo locally and upload it when the connection returns, so a receipt
   photographed at the till is never lost to a dead zone.

Trade-offs: conflict rules must be written down (last change wins per item; a delete beats an edit); the "server is the
source of truth" comments (`store/shopping-list.state.ts:45`) change to "the server wins on conflict"; API calls bypass
the service worker on purpose (`interceptors/service-worker-bypass.interceptor.ts:13-14`), so the outbox lives in the
page, not in the worker.

### F2. Phone shell and a Shop mode

- **Bottom tab bar on phones:** Dashboard, Lists, Scan (centre, raised), Receipts, More. The sheet stays for settings.
  Today each switch is a reach to the top-left corner and two taps (`header.component.html:7`,
  `sidebar.component.html:9`).
- **Header on a phone:** remove the palette menu and theme switch (`header.component.html:52-75`, C8); keep
  notifications and the household.
- **Shopping list page** (`shopping-lists-page.component.html`):
  - the list switcher moves from below the items (`:165-203`) to a chip row under the title;
  - "Delete list", a red button in the page header beside "Add List" (`:8-21`), moves into the ⋮ menu that already
    exists (`:98-137`);
  - the add form, sticky and two rows tall on a phone (`shopping-list.component.html:2-33`), collapses to one "Add an
    item" row that expands on focus.
- **Shop mode** (one switch, or automatic after "Going shopping"): keeps the screen on, which today is a menu item
  (`shopping-lists-page.component.html:111-116`); larger rows; hides the trips panel; groups items.
- **Grouping by aisle.** Items are shown in the order they were added (`store/shopping-list.state.ts:92-98`) and have no
  category or position (`models/shopping_list_item.go:32-46`). The AI already classifies each item for health and
  season (`jobs/clean_up.go:55-56`); the same call can return a store section. Bolder: learn each shop's order from the
  sequence in which items get ticked (`checkedAt` is stored) and sort the next list for that shop the same way.
- **Sessions.** The default sign-in lifetime is 24 hours of inactivity (`api/internal/models/system_settings.go:36`), so
  a family member who skips a day signs in again at the shop door. Default to 30 days, the current maximum
  (`commands/upsert_system_settings_command.go:19-20`), raise the cap to a year, and add "sign out everywhere".

### F3. Scanning a receipt

- The picker has no camera hint: `acceptFileTypes` is the only input (`receipts/upload-image/upload-image.component.ts:22-27`),
  while the barcode and avatar pickers do use `capture` (`product-check/barcode-photo-actions.component.ts:33`). Give
  Quick Scan two native buttons, "Take photo" (`capture="environment"`) and "Choose files".
- Model defaults ask for payer and status on every photo, both required
  (`api/internal/models/group_receipt_settings.go:14-21`; fields at `quick-scan-dialog.component.html:57-98`), against
  the product rule "paid by = the logged-in user". Default all five extra fields to off: photo, done.
- Add manifest `shortcuts` ("Shopping list", "Scan a receipt") for a long press on the app icon, and a file
  `share_target` so a photo or an e-receipt PDF can be shared into Quick Scan from another app; today the share target
  takes recipe links only (`desktop/src/manifest.webmanifest:10-14`).
- `upload-image.component.ts:55-81` reads every file into memory with a `FileReader` whose result is never used.

### F4. Reviewing the lines

`receipt-products.component.html` is an eight-column table inside `overflow-x-auto` (`:15-30`). On a phone:

- one card per line: name and amount on the first row, category chip, health and tags on the second; tap to edit in
  place; delete behind a swipe or the edit state, not a permanent red button beside edit (`:108-135`);
- keep the photo visible (pinned above, pinch to zoom) while editing; the sum checks that already exist (`:162-180`)
  stay pinned at the bottom with one "Looks right" button that settles the receipt;
- lines the reader should look at first go to the top: no amount, or the ones that break the sum;
- three `aria-label`s are built by English string concatenation, outside `| t` (`:112,122,131`).

### F5. Lists and tables on a phone

The shared table is `<div class="overflow-x-auto">` around a table (`desktop/src/table/table/table.component.html:1`),
and `receipts-table.component.html` has no phone variant. Add a row-card mode to `app-table` once (two lines: shop and
date left, amount and status right), switched by the existing `ViewportService.isHandset`, and every list page gets it.

### F6. Spending insights

- Lead with one sentence above the panels: spent, goal, days left, and the daily amount that keeps the month on goal.
- Per category, show the change against the same point last month, and the share that was "not on the list": the data
  for both exists on product lines (`receipt-products.component.html:92-94`).
- A weekly digest through the existing Web Push path.
- The Dashboard is one 1,523-line component with a 712-line template (`overview/overview-page/`) plus a 563-line layout
  engine with per-device previews (`overview/dashboard-layout/dashboard-layout.ts`). Split each panel into its own
  component that loads and fails alone, as `DESIGN.md:87` already asks, and consider whether drag, resize and three
  preview sizes earn their weight against "show, hide and order".
- Page actions (Quick Scan, New list, Check product, Customize) sit at the top of the page and scroll away
  (`overview-page.component.html:35-74`); F2's tab bar takes Scan and Lists.

### F7. Angular architecture

Measured in non-test code, without the generated client:

| Signal | Count | Reading |
|---|---|---|
| Zoneless | `app.config.ts:79` | Done |
| `signal()` / `computed()` / `effect()` | 228 / 294 / 37 | Healthy |
| signal `input()` vs `@Input()` | about 400 / 70 | Nearly migrated |
| `@if` / `@for` vs `*ngIf` / `*ngFor` | 381 / 89 vs 64 / 4 | Finish the 68 |
| `standalone: false` | 122 of 203 components, 45 NgModules | C13 |
| `ChangeDetectionStrategy.Eager` vs `OnPush` | 146 / 56 | With signals everywhere, move to OnPush as components are touched |
| manual `.subscribe(` | 230 (153 `take(1)`) | Many are one-shot loads; `httpResource`/`rxResource` appears once |
| `@defer` | 0 | Use it for charts, the image canvas and the barcode scanner |

Other findings:

- **S3, the build bug:** `app.config.ts:38` imports `environment.development` directly, and `angular.json:116-121`
  only swaps files in the development configuration, so `isProd` is `false` in production: NGXS development mode
  (`:105`, state frozen on every action) and Redux DevTools (`:110`) are on. One-line fix; `store/store.module.ts:6`
  has the same import.
- `desktop/src/store/store.module.ts:22-64` is a second root store definition, used by specs only, already out of step
  with `app.config.ts:40-75` (two states and two storage keys missing). Specs should build on the real list.
- `desktop/src` has about 60 top-level folders: per-widget modules from upstream (`button/`, `input/`, `select/`,
  `table/`, …) beside `shared-ui/`, `ui/` (helm) and `standalone/`. Three homes for shared pieces; fold the first into
  `shared-ui/` during C13.
- **Navigation waits on the network with nothing on screen.** Opening a receipt runs a guard that calls the API
  (`guards/receipt-guard.guard.ts:18`) and then a resolver that calls it again
  (`receipts/receipts-routing.module.ts:36-45`); the household pages resolve the same household on the parent route and
  on each child (`group/group-routing.module.ts:42,59,78,96,115`). On a slow phone connection the tap appears dead.
  Load inside the page with a skeleton, and let the one request answer both questions.
- **Scan progress is polled.** The receipt page asks every 30 seconds, up to 20 times, whether the AI has finished
  (`receipts/receipt-products/receipt-products.component.ts:23,26,451-461`). The server already pushes events for
  lists; send "receipt read" the same way and the lines appear the moment they exist.
- The first paint waits for token refresh, then app data, then about 14 store actions
  (`services/app-init.service.ts:20-49`), then the language file (`app/app.config.ts:96-101`). With F1 the shell should
  paint from the stored copy first and refresh behind it.

### F8. Bundle and loading

From the 5 Nov build: 45 JavaScript files, 3.02 MB in total; the first load is `main` 538 KB plus a 977 KB shared chunk
(136 KB and 232 KB gzipped); styles 164 KB. The budget is 3 MB warning, 5 MB error (`angular.json:45-50`), so it guards
nothing: set it just above today's figure. The icon map (C10) sits in the first load (about 177 icon bodies in the
shared chunk); per-component icons and `@defer` for heavy views move weight out. The barcode library is already its own
lazy chunk (459 KB). Run `ng build --stats-json` once to see what else the 977 KB chunk holds.

### F9. Design-system changes worth making

- 44 px targets on coarse pointers through one token (C7).
- Interface size as a setting instead of viewport-driven root scaling (C9).
- Theme controls out of the header (C8).
- One button idiom and Material names retired (C11); Lucide named directly (C10).
- A written phone pattern for data tables (F5) and for dialogs: on a phone a dialog should be a bottom sheet with its
  primary action within thumb reach, which `DESIGN.md:85` does not cover.

### F10. The site

Clear and fast: Astro, no third-party scripts, a live demo of the real app under `/demo/`. Three things:

- The page never shows how to install; both calls to action leave for GitHub (`site/src/pages/index.astro:447,506`). Put
  the three quick-start steps on the page.
- Drift: "Reports come out as PDF" (`index.astro:66`) against PDF, CSV and Excel (`README.md:203`); the FAQ names three
  AI providers and omits the local-model option the README offers (`index.astro:136`, `README.md:200`).
- Its backup advice repeats "copy the folder with the container stopped" (`index.astro:138`); update it with B2.

---

## 5. Tech debt and deletion candidates

| ID | What | Where | Note |
|---|---|---|---|
| D1 | Cell runtime | `api/internal/cell/`, `api/tools/celllint/`, `api/scripts/cell-lint.sh`, `api/docs/cell-runtime.md`, `CARTVIBE_MODE` (`api/main.go:44-53`, `env/config.go:56-60`), 859 `ImplicitCell()` calls | C2 |
| D2 | Multi-database leftovers | Comments and portability code for MySQL/Postgres, for example `oidc/provision.go:116-128` ("both supported here"), `repositories/system_settings.go:197-198`, `models/comment.go:3-5,12-15`, `repositories/shopping_lists.go:177-178`, `desktop/src/validators/text-validators.ts:7-9` | SQLite is the only engine (`db.go:118-129`) |
| D3 | Dead Go code | `handlers/sign_up.go:59-85` (`validateSignUpData`, no caller); `jobs/asynq_scheduler.go:34-36`; the "first admin" result both callers discard (`handlers/login.go:24`, `oauth/authorize.go:94`, computed at `services/auth.go:163-176`, `repositories/users.go:327`); `handlers/migrations.go` (package line only); the empty `/api/migrate` router (`routers/router.go:90-93`); `repositories/files.go:575-579` and `api/testing/test.jpg` | |
| D4 | Dead files | `api/entrypoint.sh`; `api/.air.toml`; the `mcp` branch of `api/generate-client.sh:26-36`; `desktop/openapitools.json` (7.11.0, unused; the generator reads `api/openapitools.json`, 7.10.0); `desktop/.vscode/launch.json:13-18` (Karma URL); 51 empty `*.component.scss` files | |
| D5 | Dead template | `#navButton` in `layout/header/header.component.html:85-100`, never referenced | |
| D6 | Receipt statuses | Five on the API, shown as two through `desktop/src/utils/receipt-status.ts:7-16`; "bulk resolve" dialog; "queue mode" (`services/receipt-queue.service.ts`, `interceptors/http-interceptor.ts:26-27`, `receipts-table.component.html:40-45`) | Collapse to To check / Settled with a data migration |
| D7 | Quick Scan settings matrix | Twelve flags (`models/group_receipt_settings.go:14-30`) and their settings page (`group-receipt-settings.component.html`, 150 lines) | F3 |
| D8 | User shortcuts | `desktop/src/settings/user-shortcut/`, `header.component.html:8-20` (hidden on phones), `UserShortcut` model | Upstream feature; a family does not need custom header links |
| D9 | Receipt comments as a thread | `receipts/receipt-comments`, `Comment` model, per-photo comment in Quick Scan | Consider one note field |
| D10 | Legacy names | 306 `mat*` identifiers (C11); typos frozen into names: `UserPrefernces` (`models/user_preferences.go:10`), `app-autocomlete`, `app-data.utill.ts`, `BuildParamaterisedString` (`repositories/notifications.go:138`) | |
| D11 | Duplicate store definition | `desktop/src/store/store.module.ts` | F7 |
| D12 | Docs that are no longer true | `api/docs/cell-runtime.md:184` (CI runs the cell lint: it does not); `api/CLAUDE.md:12-13` (`GOTOOLCHAIN=local`: set nowhere); `api/CLAUDE.md:85` ("Unauthenticated": `ConvertToJpg` is behind auth, `routers/receipt_image.go:12,18`); `docker-compose.yml:27` ("email polling"); `docker-compose.yml:3` against `README.md:161` on whether a redeploy pulls; `/volume1` in the README against `/volume2` in compose; `docs/vps-deploy.md:62-64` ("take a snapshot": the command lists them); `Dockerfile:1` ("Three stages": four); `api/swagger.yml:8-9` (licence "GPLV3": the project is AGPL-3.0); `api/README.md:7` (email import); `NOTICE.md:6` ("the mobile client") | |
| D13 | Unused in the web app | Dependencies with no import: `jwt-decode`, `@angular/platform-browser-dynamic`, `@angular/localize` (`desktop/package.json:36,51,63`). Code referenced only by its own file: `guards/development.guard.ts`, `directives/development.directive.ts`, `services/keyboard-shortcut.service.ts`, `resolvers/categories.resolver.ts`, `resolvers/tags.resolver.ts`, `receipt-processing-settings/receipt-processing-settings.resolver.ts`; `assets/split.svg` (no reference); `selectedDashboardId` in `store/group.state.ts` (per-household dashboards were removed) | Confirm each with a build before deleting |
| D14 | Small Go bugs and nits | `api/main.go:22` imports `golang.org/x/net/context`; wrong password answers HTTP 500 (`handlers/login.go:25-27`); every limit but one answers 503 instead of 429 (`default.conf:84` is the exception); the categories list reports the page length as the total (`handlers/categories.go:108`); `PrepareAccessTokenClaims` takes its argument by value and changes nothing (`services/auth.go:228-231`); the asynq shutdown functions are both deferred and called (`api/main.go:74,80,86,115-117`) | |
| D15 | Sign-in with an identity provider (OIDC) | The API has the whole flow: 3,140 lines of code, 3,741 of tests, four tables (`api/internal/oidc/`, `handlers/oidc*.go`, `db.go:202-205`). The web app has no button to start it and no page to configure it (`desktop/CLAUDE.md:179`; `desktop/src/auth/` has no provider code); only the profile page lists existing links | Add the two small screens, or remove the flow |
| D16 | REST search | `GET /api/search` has no caller in the web app (the header search box was removed), yet nginx keeps a rate-limit zone for it (`docker/default.conf:17,50-57`). The MCP tool uses the service directly | Remove the route and the zone |
| D17 | More unused Go, found by search | `handlers.GetReceiptsForGroupIds` (`handlers/receipts.go:153`, not routed); the `tokenValidator` parameter of five router builders (`routers/router.go:34-47,79`); `structs.Config`, `AiSettings`, `DebugConfig` (`structs/config.go`); `models.ChartGrouping`; `commands.LogoutCommand`; `SystemSettings.NumWorkers` (accepted, never read); the `easyOcr` engine value; test helpers compiled into the binary (`repositories/testing.go`, `utils/testing.go`) | Confirm with `staticcheck` (U1000) before deleting |

---

## 6. Security and reliability findings

### High

| ID | Finding | Evidence | Fix |
|---|---|---|---|
| S1 | A fresh install has the account `admin` / `admin` and nothing forces a change. The docs then walk the owner through putting it behind HTTPS on the internet. A person cannot change their own password at all | `api/internal/commands/constants.go:3-10`; `repositories/users.go:222-239`; `README.md:103`; `docs/faq.md:25,32` | First-run setup screen, or a random bootstrap password printed once in the log; add self-service password change |
| S2 | No consistent backup happens by itself, and upgrades migrate the schema with no snapshot | `repositories/db.go:161-219`; `docs/faq.md:148-154`; `README.md:169-170`; `docker-compose.yml:6-8` | B2, B3 |
| S21 | Any failed token refresh signs the user out, runs `localStorage.clear()` (theme, palette, language, filters all gone) and opens the login page. A lost signal, a NAS restart during a deploy and a rate-limit 503 all count as failures. It runs at every app start, every 15 minutes and from the route guard | `desktop/src/services/token-refresh.service.ts:30-35`; `services/app-init.service.ts:28-38`; `app/app.component.ts:39-50`; `guards/auth.guard.ts:48-52` | Sign out only on 401/403 from the refresh call; otherwise keep the session and retry; never clear all of local storage |

### Medium

| ID | Finding | Evidence | Fix |
|---|---|---|---|
| S3 | Production runs NGXS development mode with Redux DevTools enabled: slower on every action, and the whole store is offered to any DevTools extension | `desktop/src/app/app.config.ts:38,105,110`; `desktop/angular.json:116-121` | Import `src/environments/environment` |
| S4 | Privilege drop fails open: unwritable folders mean the API, ImageMagick, Ghostscript and unsandboxed Chromium run as root, with one line in the log | `docker/entrypoint.sh:23-28`; `api/internal/env/config.go:74-85` | Refuse to start unless `ALLOW_ROOT=1`; show a warning in System Settings; add `security_opt: no-new-privileges` and `cap_drop` to compose (neither file sets any) |
| S5 | `docker stop` ends PID 1 right after signalling, so the API is killed before its shutdown code; that code would itself exit 1 after 5 s whenever a list is open | `docker/entrypoint.sh:34-44`; `api/main.go:113-124`; `logging/log.go:50-54` | B4 |
| S6 | A later push to `main` can publish `:latest` although an earlier commit's tests failed and were never re-run | `.github/workflows/ci.yml:26-49,53,82,137`; `publish-image.yml:37` | Run all jobs on `main` |
| S7 | The AI's answer is bound to the REST command, so it can set payer, status and comments | `services/receipt_processing.go:223`; `services/receipts.go:402-408,457-469` | B5.1 |
| S8 | No per-account throttle on sign-in. The per-address limit allows about 43,000 guesses a day, and each guess for a real user costs a bcrypt at cost 14 on a NAS processor | `services/auth.go:131-145`; `utils/auth.go:15`; `docker/default.conf:15,60-67` | Back off per user name in Go; answer 401, not 500 |
| S9 | The strict sign-up limit is on `/api/signup`; the route is `/api/signUp`. With sign-up switched on, only the general 10 per second limit applies to an endpoint that hashes a password | `docker/default.conf:16,70-77`; `routers/router.go:39`; `desktop/src/open-api/api/auth.service.ts:390` | Fix the location; sign-up is off by default (`models/system_settings.go:5`) |
| S10 | Valkey is a hard boot dependency for the whole app | `api/main.go:70-73`; `docker-compose.yml:11-13` | B1 |
| S11 | One hung AI call can block all scans for 10 minutes | `constants/http.go:15`; `jobs/quick_scan_handler.go:32` | B5.4 |
| S22 | SQL injection through the sort column of the categories and tags lists. `orderBy` comes from the request unchecked, and a value that starts with a double quote is written into `ORDER BY` as raw SQL. It needs `app.categories.read` or `app.tags.read`, which only admins hold by default, and it allows reading any table (password hashes, token hashes, encrypted keys) one bit at a time | `commands/paged_request_command.go:46,65`; `repositories/categories.go:82-99`; `repositories/tags.go:89-105`; `repositories/base_repository.go:78-79,277-280`; `handlers/categories.go:87` | An allow-list of sort columns, as the users and receipts lists already have |

### Low

| ID | Finding | Evidence | Fix |
|---|---|---|---|
| S12 | Secrets are encrypted with a key that is one SHA-256 of `ENCRYPTION_KEY`, cut to 128 bits, with no length check; a short key is cheap to brute-force from a leaked database | `utils/encryption.go:19,55`; `utils/hash.go:17-22`; `env/config.go:43-54` | Require 32 characters or more at boot; later, a versioned prefix and HKDF |
| S13 | The CSP is report-only and has no report target, so nothing tells you when it is safe to enforce | `docker/default.conf:212-214` | Add a small report endpoint that writes to the log |
| S14 | 15 hashed chunks are revalidated on every load; on plain-http installs there is no service worker to hide it | `docker/default.conf:219` | B7 |
| S15 | Ollama errors are read as empty answers; a Tesseract setup error returns empty text | `ai/ollama.go:62-81`; `services/ocr.go:99-101` | B5.5, B5.6 |
| S16 | The log file grows without limit | `logging/log.go:26` | B8 |
| S17 | The API listens on all interfaces | `api/main.go:130` | B4 |
| S18 | Image delete continues after an error response; image read reveals whether an id exists | `handlers/receipt_image.go:209-212,110-114` | B6 |
| S19 | The security scan runs after the image is pushed | `publish-image.yml:112-151` | Scan a locally loaded image first, then push |
| S20 | The refresh cookie is sent on every request | `services/auth.go:223` (`Path: "/"`) | Scope it to `/api/token` |

---

## 7. Phased roadmap

### Phase 1: quick wins (each under a day, low risk)

1. S21: a failed refresh no longer signs out or clears storage (`token-refresh.service.ts:30-35`). S3: fix the
   environment import (`app.config.ts:38`, `store.module.ts:6`).
2. nginx: S9 location, S14 pattern, compression after the **[check]**, 429 for every limit.
3. B4: entrypoint waits for its children; streams end on shutdown; listen on loopback.
4. S6: all CI jobs on `main`. Add `go vet`, `staticcheck`, `govulncheck`, `npm audit --omit=dev`; three more smoke
   specs.
5. B2.1: snapshot before migrating and nightly (no UI yet). This is the one to do if only one is done.
6. S1: random bootstrap password; update `README.md:103` and `docs/faq.md:32`. S22: allow-list the sort column.
7. B5.1, B5.4, B5.5 (status check), B5.6 (blacklist and the swallowed error).
8. F2 sessions: default 30 days.
9. F3: camera button, manifest shortcuts; F4: the three `aria-label`s.
10. B7: `.dockerignore`, binary-only copy, split dependency script.
11. D3, D4, D5, D12, D13, D14, D16, D17: deletions and doc fixes. D15 needs your decision first: finish or remove.
12. Dependabot configuration.

### Phase 2: structural and UX upgrades (several days each)

1. F1: offline list (persist, outbox, `clientId`, status), then queued scans.
2. F2 and F9: tab bar, header, list page layout, Shop mode, 44 px targets, interface size.
3. F4 and F5: line cards and the phone mode of `app-table`.
4. B1: jobs in SQLite; remove Valkey from both compose files and the docs.
5. B3: version tags, pinned compose, upgrade test with a schema fixture.
6. B6: image endpoint, thumbnails, stored derivatives.
7. B5.2, B5.3, B5.6: schema output per provider, effort, OCR languages.
8. D1: remove the cell runtime.
9. C13, C11, C10: standalone migration, one button idiom, Lucide names.
10. B8: phone and WebKit Playwright projects, trap checks, build once.
11. B2.2 to B2.4: close on shutdown, pragmas, split pools.
12. D6 to D9: statuses, Quick Scan settings, shortcuts, comments.

### Phase 3: bold rethinks

1. B9: no cgo, then Go serves the app; arm64 images follow.
2. B10: reports without Chromium.
3. C14: three fixed roles.
4. C12: signal stores instead of NGXS.
5. F2: aisle order learned per shop.
6. B6: id-only file paths.
7. Money as integer minor units. Columns are `decimal(10,2)` (`models/receipt.go:21`), which SQLite stores as floating
   point: one reason the "never SQL `SUM`" rule (`CLAUDE.md:37`) is needed. Integers would make sums, filters and
   sorts exact in SQL. Cost: a migration over every amount column.
8. The contract: generate `swagger.yml` from the Go types, or the Go types from it, so 8,623 hand-written lines cannot
   drift.

---

## What this audit did not cover

- Nothing was executed: no tests, no build, no container. Bundle figures are from the build already on disk.
- The **[check]** item (nginx compression, and through it the first-load transfer size) rests on Debian's default
  `nginx.conf`, which is not in the repository.
- Read in outline only: the reporting engine, OIDC and MCP flows, household import, recipe import, the Dashboard's
  individual panels, the report builder.
- No dependency was checked against an advisory database.
- `docs/plans/` and `i18n-audit-en-pl.md` were left unread, as yours.

