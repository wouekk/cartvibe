# E2E suite (Playwright): setup, helpers and per-spec gotchas

Purpose: how to run `desktop/e2e/` and what each group of specs relies on. The rules every new spec follows are in
`../CLAUDE.md` → E2E. The suite needs a live Go API. CI runs a smoke subset (`npm run e2e:smoke`) against the built image; the rest is not run there.

## State of the suite

About 41 specs plus `auth.setup.ts`. A full run in Docker (2026-11-01, built image, 2 workers, fresh database, `run-docker.sh`):
193 tests, 113 passed, 39 failed, 41 did not run (a `beforeAll` failed). The 2026-10-30 devstack run was 217 tests, 45 passed,
90 failed, 82 did not run; the difference in total is the three deleted role-editor specs (`roles`, `role-defaults`,
`role-assignment`) and the cases dropped from `receipts`, `skip-default-group` and `receipt-role-requirements`. `e2e:smoke`
is unchanged (`auth.spec`, `dashboard-charts`, `generate-password`, `report-template-list`); more files join it only after
three green runs in a row.

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
- **Unnamed selects.** `app-select` does not associate its `<label>` with the trigger, so `getByRole('combobox', { name })` finds
  nothing; use `comboboxNamed(scope, label)` (`helpers/ui.ts`). The checkboxes in Configure Columns all read "Receipt Date" to
  assistive tech (`aria-labelledby="null-label"`), so find them through the wrapping `<label>` and click the label text.
- **Dates:** the period pickers are native date inputs, `fill('yyyy-MM-dd')`. The count chip says "1 receipt" in the singular.
- **Receipt form:** no Group, Paid By, shares or items; the Name is pre-filled and Amount is the only other required field.

Still failing (open), by cause:
- Quick Scan dialog specs (`quick-scan-dialog`, `-behavior`, `quick-scan-config`, 11 tests): the dialog no longer shows the
  Group / Status / Categories selects or the paid-by defaults these expect, and "Successfully queued" is not the toast text.
  Rewrite against the current dialog or delete the paid-by cases.
- `paid-by-visibility`, `single-group-default`, `receipt-role-requirements` (create case): they assume a Group or Paid By field
  on the receipt form. Drop or rewrite.
- Report builder: `report-grouping-label` (the grouping Field input is no longer read-only), `report-builder` aggregate-column
  case, `report-period-date-field` drill-in, `report-template-*` gating/access specs (the custom users they provision log in
  and capture a session; the cause is not found yet), `report-template-list` delete.
- System Settings: `app-time-zone`, `session-lifetime`, `temp-file-retention` (the tabs and labels moved), and
  `system-task-filter` (option list).
- `comment-gating` (delete control), `group-delete-any`, `group-viewer-visibility`, `member-grant-assignment` /
  `-visibility` (one UI case each), `shopping-list` (list tab), `receipt-update-diff`, `receipt-quick-date-filter`
  (month stepper removed), `receipt-comment-column`, `chip-select-close-on-select`, `skip-default-group` (personal group case),
  `generate-password` (Set Password dialog opener).
- `receipts.spec` "create a basic receipt" fails now and then at 3 workers (503 on the save); fine at 2.

Real app problems found (not hidden by the specs):
1. `app-select` has no accessible name (label not tied to the trigger): screen readers announce an unnamed combobox.
2. The Configure Columns checkboxes are all named "Receipt Date" (`aria-labelledby="null-label"` from `hlm-checkbox`).
3. A new admin account joins the Household as Member and so cannot report on it until made Owner; the first-start `admin` is Owner.

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
- `ui.ts`: `comboboxNamed` (a combobox by label, for the unnamed `app-select`).
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
