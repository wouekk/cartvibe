# E2E suite (Playwright): setup, helpers and per-spec gotchas

Purpose: how to run `desktop/e2e/` and what each group of specs relies on. The rules every new spec follows are in
`../CLAUDE.md` → E2E. The suite needs a live Go API, so it runs nowhere in CI yet.

## State of the suite

About 44 specs plus `auth.setup.ts`. Many predate the family rework and the UI redesign and have not been run since:
anything that drives the role editor UI (`createRole` in `helpers/provisioning.ts`, `roles.spec.ts`,
`role-defaults.spec.ts`; there is no `/roles` route any more), custom fields, paid by, shares, the old receipt
statuses, required Quick Scan fields, the Added At column, the old System Settings tabs, or Material selectors
(`mat-option`, snackbars). Expect to update a spec before trusting it; `apiCreateRole` is the API-side replacement for
provisioning a role.

## Running locally

1. Install the browser once: `npm run e2e:install` (in the cloud sandbox see `sandbox.md` instead).
2. Create the two accounts once, as `admin`, against your database (public sign-up is off on a fresh DB):
   `e2e-admin` / `e2e-admin-password` (display name `E2E Admin`, admin role) and `e2e-user` / `e2e-user-password`
   (display name exactly **`E2E User`**: the provisioning helpers pick the member by that option text).
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
  `apiDeleteReportTemplateById`, `apiDeleteProcessingSettings`. UI flows `createRole`, `createUserWithRole`,
  `createGroupWithMember` are stale (see above).
- `quick-scan.ts`: `injectQuickScanAppData`, `openQuickScanDialog`, `uploadQuickScanImages`, `selectImageGroup`,
  `parseMultipartFields`.
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
