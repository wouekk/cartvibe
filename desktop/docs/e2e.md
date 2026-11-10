# E2E suite (Playwright): setup, helpers and per-spec gotchas

Purpose: how to run `desktop/e2e/` and what each group of specs relies on. The rules every new spec follows are in
`../CLAUDE.md` → E2E. The suite needs a live Go API. CI runs a smoke subset (`npm run e2e:smoke`) against the built image; the rest is not run there.

## State of the suite

About 40 specs plus `auth.setup.ts`. Full runs in Docker (built image, 2 workers, fresh database, `run-docker.sh`):
- 2026-10-30 (devstack): 217 tests, 45 passed, 90 failed, 82 did not run.
- 2026-11-01 round 1: 193 tests, 113 passed, 39 failed, 41 did not run.
- 2026-11-01 round 2: 187 tests, 129 passed, 22 failed, 2 skipped (`test.fixme`), 34 did not run (a `beforeAll` failed).
- 2026-11-01 round 3 (`feature/e2e-repair-3`): 179 tests, no `fixme`. Fresh app and database per run, image built from the branch:
  the last 5 full runs in a row were green (179 passed, 0 failed, 0 not run, 1.7 minutes each). The 10 runs before the last two
  spec fixes had 2 reds (the report-template-list delete case, and an unpolled settings read), and the runs before that were
  red for the app races listed below.

`e2e:smoke` is `auth.spec`, `dashboard-charts`, `generate-password`, `report-template-list` and `member-grant-security` (green three
runs in a row, 7 seconds), and since 2026-11-10 `shopping-list.spec`, `quick-scan-dialog.spec` and `receipts.spec`, so CI
touches a list, the scan dialog and a receipt. `report-template-list` is serial now: its delete case used to hit the wrong row when a parallel test
added a template under a pending click. More files join smoke only after three green runs; one that turns flaky in CI leaves the list again.

**Phones.** `phone-shell.phone.spec.ts` is the app as it is used in the shop: from the landing page by taps only,
the tab bar, a new list with an item added and crossed off, the receipts as cards, the scan dialog, and no sideways
scroll on the way. It runs twice in the smoke job, in Chromium as a Pixel 7 and in WebKit as an iPhone (the closest
thing to Safari that runs in CI; `npm run e2e:install` fetches both browsers). Its taps and test ids were proved
against the built demo first; the real app and WebKit are CI's to judge.

Around the specs, the `e2e-smoke` job checks the container itself: the API runs as uid 10001 with the compose files'
security options, a folder that refuses that user stops the start with exit code 78, `ALLOW_ROOT=1` runs it as root; the main script arrives gzip-compressed with an
`immutable` cache header, a burst of 120 requests gets both 200s and 429s (the request limit), `docker stop` ends
with exit code 0 inside the grace period, and a second container started on the same volumes under another `VERSION`
leaves an `app-upgrade-*.db` snapshot in `sqlite/backups`.

**The specs run with nginx's request limit raised** (`e2e/relax-rate-limits.sh`, called by the job and by
`run-docker.sh up`). Until 2026-11-10 the job ran them under the production limit, and a spec or two needed a second
try in most runs ("create a basic receipt" most often, sometimes all three tries). The cause, measured in the job:
the limit refused a handful of the specs' requests per run (seven in the run that was counted: a receipt read, the
app data, a group update, a template save), because every spec comes from the runner's one address and provisions
through the API while another spec loads a page, and the app did not retry a 429 then (it does now:
`rateLimitRetryInterceptor`). One person's page load is 2 to 11
requests, so the limit is right for the product. After the specs the job fails if any of their requests was
refused, so a starved spec can no longer pass as a flaky one. A spec that needs a retry now is wrong, or the app is.
Three runs on the day: no request refused, "create a basic receipt" first time each run.

**A canvas is visible before it is drawn.** One of those runs retried the phone case of `dashboard-charts`: its
single tap on a slice did nothing. Reproduced against the built demo with the processor slowed six times: a tap sent
as soon as the canvas is visible lands on an empty canvas (the chart library is still loading) and does nothing, 22
times of 22, and the page above the donut still moves by a few pixels afterwards; waiting until the slice is drawn
where the tap will land works 22 times of 22. The hover cases never failed because a resting mouse gets a new event
when the page under it changes, and a finger does not. The case now polls the pixel under the tap first. A spec that
taps or clicks a point on a canvas must do the same.

What was wrong, by cause (fixed unless marked open):
- **Rate limit and expiry (environment).** nginx allows 10 requests a second (burst 20) and 30 logins a minute for the whole
  run, answering 429 beyond that (503 before 2026-11-10); the access token lives 20 minutes. Provisioning calls retry both and reuse a login for
  five minutes (`helpers/provisioning.ts`); run with 2 workers, and in batches if a run could pass 20 minutes (the `setup`
  project logs in again on every invocation).
- **Secure context.** The page must be on `http://localhost` (the runner shares the app's network namespace), otherwise
  `navigator.clipboard` is missing and `generate-password` fails.
- **Role editor and custom-role pickers are gone.** `createRole`, `createUserWithRole` and `createGroupWithMember` now call the
  admin API with the same option names (presets map to the Legacy roles, toggles to permission keys). The household member
  dialog only offers the family roles, so a custom group role can only be assigned through the API.
- **Landing is `/overview/group/<id>`**, not `/dashboard/...`; a denied route lands on the Dashboard, the receipts list or `/`.
- **`e2e-admin` must own the Household** to have `group.reports.read` (a new account is a Member there): `seed-accounts.mjs`
  does it, otherwise the report builder's "Add a group" lists nothing.
- **Select and checkbox names.** Fixed in the app (round 2): `app-select` labels its trigger and checkboxes get unique ids. A native-looking `check()` on an `app-checkbox` can still toggle twice (the button is inside its label): use `setAppCheckbox` (`helpers/ui.ts`).
- **Dates:** the period pickers are native date inputs, `fill('yyyy-MM-dd')`. The count chip says "1 receipt" in the singular.
- **Receipt form:** no Group, Paid By, shares or items; the Name is pre-filled and Amount is the only other required field.

Round 3 changes in how the suite is run and written:
- **`run-docker.sh up` relaxes nginx's request rates** (same config, `10r/s` and `30r/m` raised) because the app does not retry a 429
  and the limits made tables and forms come up empty at random. CI's `e2e-smoke` does the same since 2026-11-10 (above).
- **Global-settings specs are their own projects** (`playwright.config.ts`: `app-time-zone`, `session-lifetime`,
  `temp-file-retention` run after the main project, one after another). A settings save sends the whole payload, so two of them at
  once overwrote each other, and the zone moving under the other specs is worse. A failure in the main project skips them
  ("did not run").
- **A describe whose `beforeAll` provisions one account must be `serial`**: with `fullyParallel` each worker runs its own
  `beforeAll`, so a second worker created the same user again (or overwrote the shared `.auth` file).
- `uniqueName` ends in three random digits (two workers minted the same millisecond), the receipts table opens on "this month"
  (give a receipt `midMonthIso()` when a spec looks for its row there), and `reloadUntilVisible` (`helpers/ui.ts`) is for the
  rare empty table after a failed request.
- A single-select or chip autocomplete opens its option list when you type, not on a bare click: `fill(...)`, then pick.

Specs rewritten for the current UI: `group-viewer-visibility` (provisions through the API, a denied route lands on the Dashboard or
the receipts list), `shopping-list` (list cards, not tabs; the Legacy Viewer base can edit lists, so the read-only role switches
those off; one case cuts the connection with `context.setOffline(true)`, adds and crosses off, reconnects and reads the list
back through the admin API, since the page alone shows its own copy; an add is done once `shopping-list-item-pending` is
gone, not when the row appears), `quick-scan-config` (Save stays on `/edit`: the PUT is the proof), `skip-default-group` (a new account joins
"Household"; `createUserWithRole({ createdWithRole: true })` creates it on the role at once), `chip-select-close-on-select` (the
Categories picker of the receipts filter dialog), `member-grant-visibility` (the product line's category menu on the receipt
form), `member-grant-assignment`, `receipt-comment-column`, `receipt-update-diff`, `report-builder` (Aggregate detail rows),
`system-task-filter`, `single-group-default` (still true: a new account has exactly one real group, Household).
`receipt-quick-date-filter` is now `receipt-period-filter` (the period picker: This month by default, a typed From/To range, the
date chip).

Retired, because the behaviour they guarded is gone:
- `receipt-quick-date-filter`: the month stepper, its "date field" menu (Receipt Date / Settled on), the "Custom" fallback label and the
  month panel's keyboard, Escape and year paging tests. The period picker and the date chip are covered by `receipt-period-filter`.
- `member-grant-assignment` "the role form authors a ceiling and rehydrates it": it drove `/roles`, removed with the role editor, and
  no other page edits a role. Its rule (an untouched save keeps the grants) is not tested anywhere in the browser now.
- `group-delete-any` browser cases: the Management list no longer has an all-groups view (its filter button is gone, so a group a
  person is not in cannot be reached), so the rule is proved on the server (403 without `app.groups.delete`, 200 with it) and the
  row action's gate stays in the group table's Vitest spec.

Open: nothing known fails. Not covered: a Quick Scan image upload that really reaches the AI, and anything on a phone. A failure in
the main project skips the three global-settings projects, so read "did not run" as "look at the failure above it".

Real app problems found (not hidden by the specs):
1. (Fixed in round 2) `app-select` had no accessible name: its label is now tied to the trigger (`comboboxNamed` is a plain role lookup again).
2. (Fixed in round 2) Every `hlm-checkbox` without an id shared the label id "null-label", so all were named after the first; it now gets a unique id (patched in `tools/spartan-add.cjs` too).
3. (Fixed in round 3) After Clear, a single-select autocomplete listed only the cleared value: its filtered options kept the filter text
   from when the options last changed (the time zone picker could not choose a new zone, and it hit every single-select that was cleared).
   Picking or clearing also never marked the form dirty, so the Save of a settings form stayed dimmed after choosing a zone.
4. (Fixed in round 3) The group member dialog's Save stayed dimmed when only the category/tag assignment changed (the user form already
   marked itself dirty).
5. (Fixed in round 3) A read-only `app-select` (the locked Field of a grouping column) had no accessible name.
6. (Fixed in round 3) The receipts table and the report template list could paint a slower earlier response over a newer one (the period
   picker asks for its page on mount while the first load is still out; a delete refetch after a slow list). The newest request wins now.
7. Not bugs, found while looking: `comment-gating` (the Legacy Editor base grants `group.comments.delete`; the control is gated and the server
   answers 403) and `quick-scan-config` (Save works, the settings page simply stays on `/edit`).
8. Open question for the product (not changed): a new admin joins the Household as Member and cannot report on it until made Owner; the first-start `admin` is Owner.
   Also: a bare click on a chip or single autocomplete shows no options until the first keystroke.


## Running the full suite in Docker (Windows PC without Node)

Needs Docker Desktop only. From `desktop/` in Git Bash (the script sets `MSYS_NO_PATHCONV=1`; `.sh` files are LF):

1. Build the image from the repo root once per code change: `docker build -f docker/Dockerfile -t cartvibe:ci .` (about 10 minutes
   cold; `CARTVIBE_IMAGE` picks another tag).
2. `e2e/run-docker.sh up` starts the app and a Playwright 1.64.1 runner (Node 24) that shares the app's network, runs
   `npm ci`, and seeds the accounts (`seed-accounts.mjs`). Every `up` is a fresh database, which the specs assume.
3. `e2e/run-docker.sh run [playwright args]`, e.g. `run "--reporter=list"` or `run "report-config --reporter=list"`
   (`E2E_WORKERS` defaults to 2: more workers trip nginx's rate limit). The specs are bind-mounted, so edits apply at once.
4. `e2e/run-docker.sh down` removes the containers.

## Running locally

1. Install the browser once: `npm run e2e:install` (in the cloud sandbox see `sandbox.md` instead).
2. Create the two accounts once with `node e2e/seed-accounts.mjs` (after step 3's variables; `API_URL` defaults to
   `http://localhost:8081`). It signs in as the first-start `admin` / `admin`, creates `e2e-admin` (Legacy Admin, display
   name `E2E Admin`) and `e2e-user` (Legacy User, display name exactly **`E2E User`**: the provisioning helpers pick the
   member by that option text) through the API, and switches their welcome dialog off. It leaves existing accounts alone.
3. Export the `E2E_*` variables each run: `source api/dev/switch-to-sqlite.sh` (SQLite is the only engine).
4. Start the Go API yourself; Playwright's `webServer` only starts `npm start`, and only when `E2E_BASE_URL` is
   localhost (it reuses a running dev server outside CI).
5. `npm run e2e` (or `npm run e2e:ui`). A remote `E2E_BASE_URL` skips the `webServer` block.

`auth.setup.ts` logs both accounts in once and writes `e2e/.auth/{admin,user}.json` (git-ignored, they hold session
cookies); the default project uses the user state, and admin specs `test.use({ storageState: 'e2e/.auth/admin.json' })`.
Config: `fullyParallel`, `retries` 2 on CI and 0 locally, `trace: 'on-first-retry'`.

## Helpers (`e2e/helpers/`)

- `auth.ts`: `creds`, `loginViaUi` (asserts the `/overview/group/<id>` landing), `stubTokenRefresh`.
- `provisioning.ts`: `uniqueName`; API-as-someone `withApiAsCreds(username, password, fn)` and its wrappers
  `withApiAs('admin' | 'user')` / `withAdminApi`; creators `apiCreateRole`, `apiUpdateRole`, `apiCreateGroup`,
  `apiCreateReceipt`, `apiCreateComment`, `apiCreateCategory`, `apiCreateTag`, `apiCreateReportTemplate`,
  `apiSetMemberGrants` (returns the raw response so specs assert 200/400/403/404), `apiSetGroupRoster`,
  `apiPatchSystemSettings`, `apiQuickScan`; readers `apiMemberCatalog`,
  `apiGetGroupMembers`, `apiGroupNames`, `apiPagedSystemTasks`, `apiWaitForFailedQuickScan`; teardown
  `apiDeleteUserByName`, `apiDeleteGroupById`, `apiDeleteRoleByName`, `apiDeleteCategoryById`, `apiDeleteTagById`,
  `apiDeleteReportTemplateById`, `apiDeleteProcessingSettings`. `createRole`, `createUserWithRole` and
  `createGroupWithMember` keep the old UI-flow names but call the admin API (the role editor is gone).
- `quick-scan.ts`: `injectQuickScanAppData`, `openQuickScanDialog`, `uploadQuickScanImages`, `selectImageGroup`,
  `parseMultipartFields`.
- `ui.ts`: `comboboxNamed` (a combobox by label), `setAppCheckbox` (toggle an `app-checkbox` through its label).
- `receipts-table.ts`: `gotoReceiptsTable`, `openReceiptsOverflowMenu`.
- `reports.ts`: `gotoReports`, `gotoReportBuilder`, `addFirstGroupToScope`, `addGroupToScopeByName`,
  `openComboboxAndPick`, `waitForPreview`, `addGroupingLevel` (takes `string | RegExp`).

## Patterns the specs share

- **Provision, then tear down through the API.** Negative-permission tests need an account or role that lacks the
  permission, which no seeded account has: an admin context provisions it in `beforeAll` and deletes it through the API
  in `afterAll`, best effort in `try/catch`. Order: user/group first, then the role (a role in use cannot be deleted);
  group → role → categories/tags for grant specs. Categories and tags are global with unique names, so mint
  `uniqueName`-suffixed ones and delete them.
- **A custom user's session** is captured to a git-ignored `e2e/.auth/<name>.json` after waiting for the held
  permission in `localStorage.auth`, and removed in `afterAll`. A group membership added after the saved session still
  works without re-login: AppData is re-fetched on navigation.
- **Global settings** (time zone, session lifetime, temp-file retention, AI provider) are mutated only by serial specs
  that capture the current value in `beforeAll` and restore only that field in `afterAll`.
- **Feature-flag-gated UI** (`aiPoweredReceipts`, off in dev): intercept `GET /api/user/appData` with `page.route` and
  flip the flag, inject `groupReceiptSettings`, `quickScanDefault*`, catalogs or `groupPermissions`
  (`injectQuickScanAppData`). No server side effects; a submit the server would validate against persisted config is
  mocked and its multipart asserted with `parseMultipartFields`.
- **Narrowing a shared list:** `page.route` + `route.fetch()` to filter the paged response down to the spec's own row
  keeps it the real server's output.
- **Menus:** an entry of a dropdown menu has role `menuitem`, not `button`, so a `getByRole('button')` negative passes
  whether or not it rendered; assert absences by `data-testid` with the menu open.
- **Toasts** auto-dismiss after a few seconds: assert them first.
- **Money** is matched with a separator-tolerant regex (`/1[,. ]500[.,]50/`) because the currency format is a global
  setting a spec must not change.

## Per-spec notes

- `generate-password.spec.ts`: the only clipboard spec (`permissions: ['clipboard-read', 'clipboard-write']`). Password
  fields carrying the generate button need `getByLabel('Password', { exact: true })`, because the button's accessible
  name "Generate password" also matches.
- `chip-select-close-on-select.spec.ts`: provisions its own account because the preference is per user and global;
  asserts the input blur before the hidden panel (the panel closes on selection by itself).
- `member-grant-{visibility,security,assignment}.spec.ts`: `e2e-user` with custom group roles (its default app role
  lacks `app.categories.read` / `app.tags.read`, so it gets no admin bypass). Assertions read `apiMemberCatalog`, the
  same per-group catalog the pickers render. The group-member dialog's submit is `dispatchEvent('click')`: adding a chip
  grows the dialog and it re-centres, so the button never passes Playwright's stability check. The roster is editable
  only on `/groups/:id/details/edit`.
- `paid-by-visibility.spec.ts`, `comment-gating.spec.ts`, `receipt-action-gating.spec.ts`,
  `legacy-user-visibility.spec.ts`, `group-delete-any.spec.ts`: hidden controls plus the API 403 that proves server
  enforcement. The receipts-table edit action is not template-gated; its route is, so that denial is asserted on the
  route. `group-viewer-visibility.spec.ts` has a known failing serial block (a Legacy User cannot load `/groups`), so
  new tests do not go into it.
- `receipt-feature-gating.spec.ts`: Quick Scan / Magic Fill for a viewer vs an editor, with the flag injected.
- `single-group-default.spec.ts` and `receipts.spec.ts`: a single-select autocomplete shows its value in a box with a Clear button
  (`data-testid="autocomplete-clear"`) once filled. A new account belongs to exactly one real group (Household) and the forms hide
  the Group; `e2e-user` gets more groups while other specs run, so `receipts.spec` picks Household when the Group field is there.
- `receipt-role-requirements.spec.ts`: create is one `POST /api/receipt/withFiles` with no `/receiptImage` upload; last
  image/comment refused in edit (UI and 400).
- `quick-scan-config.spec.ts`, `quick-scan-dialog*.spec.ts`: config checkboxes use `quick-scan-<field>-show/-require`
  test ids (the labels collide). To change an image's group, clear the autocomplete first (`selectImageGroup` does).
- `receipt-period-filter.spec.ts`: the period picker is typed into (`overview-custom-from/-to`, DD/MM/YYYY); the table always
  reopens on "This month" (the picker emits it on mount), so a range survives no reload.
- `receipt-comment-column.spec.ts`: the opt-in column, first comment only, server sort both ways.
- `app-time-zone.spec.ts`: picks `America/New_York`, compares "Added at" with whitespace normalized (CLDR puts U+202F
  before AM/PM).
- `session-lifetime.spec.ts`: the only proof of model → DB → JWT → `Set-Cookie`; `temp-file-retention.spec.ts` covers
  the days/hours round trip and the 24-hour floor. Do not e2e the temp-file sweeper (the floor makes it unobservable).
- `failed-activity-source-file.spec.ts`: points the global AI provider at an unreachable host to make a quick scan
  fail, then checks preview, a byte-identical download, a non-member 403 and the tasks table controls.
- `system-task-filter.spec.ts`: seeds a row by creating a receipt, which records a Receipt Uploaded task (nothing creates a task directly).
- `receipt-update-diff.spec.ts`: keeps an unchanged item across the update so the summary proves recreated items are
  not reported as edits.
- `report-*.spec.ts`: `report-period-date-field.spec.ts` runs a block with `timezoneId: 'America/Los_Angeles'`; the
  count chip reads `receipt_long<N> receipts`, so match `(?<!\d)N receipts`. The period "Date field" label makes a bare
  `getByLabel('Field')` ambiguous; scope lookups to the dialog. `report-grouping-label.spec.ts` asserts against the
  preview iframe's `srcdoc`.
