# E2E suite (Playwright): setup, helpers and per-spec gotchas

Purpose: how to run `desktop/e2e/` and what each group of specs relies on. The rules every new spec follows are in
`../CLAUDE.md` → E2E. The suite needs a live Go API. CI runs a smoke subset (`npm run e2e:smoke`) against the built image; the rest is not run there.

## State of the suite

About 40 specs plus `auth.setup.ts`. Full runs in Docker (built image, 2 workers, fresh database, `run-docker.sh`):
- 2026-10-30 (devstack): 217 tests, 45 passed, 90 failed, 82 did not run.
- 2026-11-01 round 1: 193 tests, 113 passed, 39 failed, 41 did not run.
- 2026-11-01 round 2: 187 tests, 129 passed, 22 failed, 2 skipped (`test.fixme`), 34 did not run (a `beforeAll` failed).

`e2e:smoke` is `auth.spec`, `dashboard-charts`, `generate-password`, `report-template-list` and `member-grant-security` (green three
runs in a row, 7 seconds). `report-template-list` still shows two failing cases in full local runs (duplicate, delete: a 503 or a
changed row action); CI retries hide it, so look at it first if smoke ever flakes. More files join smoke only after three green runs.

What was wrong, by cause (fixed unless marked open):
- **Rate limit and expiry (environment).** nginx allows 10 requests a second (burst 20) and 30 logins a minute for the whole
  run, answering 503 beyond that; the access token lives 20 minutes. Provisioning calls now retry a 503 and reuse a login for
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

Still failing (open), by cause. The 34 not-run tests belong to the same files:
- **Receipt form assumptions:** `chip-select-close-on-select` (the receipt form has no Categories picker; the preference needs
  another chip picker to test), `member-grant-visibility` "receipt form offers the effective set" (same picker),
  `receipt-role-requirements` create case (needs a Group field), `single-group-default` now passes only because the
  form hides the Group; its premise is gone, so retire it next.
- **Report area:** `report-builder` aggregate-column case and `report-grouping-label` (the grouping Field input is not
  read-only any more), `report-period-date-field` drill-in (the receipt name matches two elements), `report-template-list`
  duplicate, `report-template-access` generate (503 or timing; passes alone).
- **System Settings:** `app-time-zone` first case is `test.fixme` and the second fails behind it (serial); after Clear the typeahead
  lists no zones, which may be an app bug. `system-task-filter` filter dialog (option list for Type).
- **Individual UI cases:** `comment-gating` delete control still renders without `group.comments.delete`
  (check whether the control is gated; possible app bug), `group-delete-any`, `group-viewer-visibility`,
  `member-grant-assignment` capped role, `shopping-list` (list tab), `receipt-update-diff`, `receipt-quick-date-filter`
  (month stepper removed: delete or rewrite for the period tabs), `receipt-comment-column` first-comment case,
  `skip-default-group` personal-group case (expects a "My Receipts" group), `quick-scan-config` comment-greying case.
- `quick-scan-config` "blocks save" is `test.fixme`: Save no longer navigates to the view page after choosing the Uploader default.
- `receipts.spec` create cases are flaky at 2 to 3 workers (503 on the save).
- Welcome dialog: `createUserWithRole` starts the account on Legacy User, turns the dialog off, then assigns the role (a custom role
  without `app.user-preferences.*` cannot switch it off itself).

Real app problems found (not hidden by the specs):
1. (Fixed in round 2) `app-select` had no accessible name: its label is now tied to the trigger (`comboboxNamed` is a plain role lookup again).
2. (Fixed in round 2) Every `hlm-checkbox` without an id shared the label id "null-label", so all were named after the first; it now gets a unique id (patched in `tools/spartan-add.cjs` too).
3. Open question for the product (not changed): a new admin joins the Household as Member and cannot report on it until made Owner; the first-start `admin` is Owner.

## Running the full suite in Docker (Windows PC without Node)

Needs Docker Desktop only. From `desktop/` in Git Bash (the script sets `MSYS_NO_PATHCONV=1`; `.sh` files are LF):

1. Build the image from the repo root once per code change: `docker build -f docker/Dockerfile -t cartvibe:ci .` (about 10 minutes
   cold; `CARTVIBE_IMAGE` picks another tag).
2. `e2e/run-docker.sh up` starts Valkey, the app and a Playwright 1.64.1 runner (Node 24) that shares the app's network, runs
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
3. Export the `E2E_*` variables each run: `source api/dev/switch-to-sqlite.sh` (the MariaDB / PostgreSQL scripts
   export the same defaults).
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
- `single-group-default.spec.ts` and `receipts.spec.ts`: a single-select autocomplete is `readonly` once filled, so
  `selectFirstOption` skips a filled field and validation cases clear it via `data-testid="autocomplete-clear"`; on a
  fresh DB the e2e accounts own exactly one group, which the forms pre-select.
- `receipt-role-requirements.spec.ts`: create is one `POST /api/receipt/withFiles` with no `/receiptImage` upload; last
  image/comment refused in edit (UI and 400).
- `quick-scan-config.spec.ts`, `quick-scan-dialog*.spec.ts`: config checkboxes use `quick-scan-<field>-show/-require`
  test ids (the labels collide). To change an image's group, clear the autocomplete first (`selectImageGroup` does).
- `receipt-quick-date-filter.spec.ts`: the month stepper's keyboard path and the label surviving a reload (the
  persisted filter comes back as ISO strings).
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
