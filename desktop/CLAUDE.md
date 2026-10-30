# desktop/CLAUDE.md

The Angular web app (phones in the shop, desktops for the overview). **Read `../DESIGN.md` before any UI change**; this
file covers behaviour and mechanics only. Backend contracts: `../api/CLAUDE.md`.

Deep notes in `docs/`: `features.md` (how each area works: Dashboard, receipts, shopping lists, reports, product
checker, translations, themes, installable app, settings screens), `sandbox.md`, `lockfile.md`, `e2e.md`,
`image-canvas.md`, `system-tasks.md`, `builder.md`. Read the matching section of `features.md` before changing a
feature.

## Commands

- `npm start`: dev server on :4200, proxying `/api` to :8081 (`proxy.conf.json`). It does not start the API.
- `npm run build` (output `dist/cartvibe/`). `npm test` runs the specs on **Vitest** through `ng test`
  (`@angular/build:unit-test`); `npm run test:ci` adds coverage (`coverage/cartvibe/cobertura-coverage.xml`). One spec:
  `npx ng test --include "src/path/x.spec.ts"` (quote the glob). Run `ng build` too (root `CLAUDE.md`).
- `npm run i18n:extract`, `i18n:check` (CI, before the specs), `i18n:sync -- --lang xx`: see Translations.
- `npm run e2e` / `e2e:ui` / `e2e:install`: Playwright, needs a live API (`docs/e2e.md`).
- Local stack on the Windows PC: `../docs/dev-setup.md`. Login on a fresh database is `admin` / `admin`; it lands on
  `/overview/group/<id>`.

## Stack conventions

- No Angular Material, no Bootstrap: comments and specs that still mention `mat-*`, `MatDialog` or Bootstrap classes
  describe the past. Most components are still `standalone: false` in NgModules; new leaf components may be
  standalone, a non-standalone one must be declared (and exported if another module uses it).
- **State:** NGXS in `src/store/`; read with `store.selectSignal(...)` or `selectSnapshot`, never `@Select` / `| async`.
  Persisted slices are listed in `store.module.ts`.
- **Zoneless traps.** Only signal writes, template/host events, `markForCheck()` and `setInput()` repaint. A plain
  field written in `subscribe`, `setTimeout`, a promise or **`finalize()`** never repaints (the login spinner once stuck
  forever on the failure path). Keep template state in signals and test the error branch. Arrays and Sets in signals
  are replaced, never mutated. Prefer `computed` / `linkedSignal` over an `effect` that copies state.
- **HTTP:** `provideHttpClient(withXhr(), …)`; XHR is kept because upload progress needs it. In templates `?.` yields
  `undefined`; the few places that relied on `null` read `$safeNavigationMigration(…)`.
- **Spartan wrappers keep the app's API:** `app-button`, `app-input`, `app-select`, `app-checkbox`, `app-textarea`,
  `app-datepicker` (`DateInputDirective` blurs on a calendar pick so Safari's popover closes), `app-autocomlete` (sic),
  `app-table` (types in `src/table/table-types.ts`), `app-tabs`, `app-card`, `app-expansion-panel`. Add a helm part only
  with `node tools/spartan-add.cjs <name>`: it re-applies the local patches listed at its end.
- **Dialogs:** `AppDialog` (`src/dialog/app-dialog.ts`); the opened component injects `AppDialogRef` and
  `APP_DIALOG_DATA`. Never hand the CDK an explicit `autoFocus: undefined` (it leaves focus on the page behind).
  Dialogs are created from the root injector, so a provider in a lazy module is invisible to them (NG0201): provide it
  in the dialog component.
- **Menus:** spartan dropdown items are a content query, so an item rendered inside a child component is invisible to
  keyboard navigation: keep menu entries as plain buttons in the menu's own template.
- **Icons:** `<app-icon name="receipt_long">` takes the Material name and draws the Lucide icon mapped in
  `shared-ui/icon/icon-map.ts`; add a pair there for a new name.
- **Tests (Vitest, zoneless):** `angular.json` target `test` (builds with the JIT `build:test` configuration, runs
  isolated, `vitest.config.ts` sets the timeouts), `setup-vitest.ts` (stubs `ResizeObserver`, canvas and `chart.js`: `src/testing/chartjs.stub.ts` records the config it is given).
  Globals are `describe`, `it`, `expect` and `vi`; mock types come from `vitest`. Prefer `setInput` +
  `await fixture.whenStable()`; after mutating a plain field call `fixture.changeDetectorRef.markForCheck()` before
  `detectChanges()`. Select by `data-testid`, ARIA state or text, never styling classes. Translated text is English in
  specs (`src/i18n/i18n-test-utils.ts`). A spec with a real `AutocomleteComponent` needs `AuthState`.
- **Spec traps (Vitest):** spec type errors fail the run. The TestBed throws on unknown elements and properties: import
  the real module or standalone component, never a `NO_ERRORS_SCHEMA`. An unhandled RxJS error fails the whole run
  (give a `subscribe` on a `throwError` mock a handler). `vi.mock` takes package specifiers only (`chart.js`), not
  relative paths: drive the real function through the globals it reads. No `done` callbacks (return a promise); a mock
  used with `new` must be a `function`; `vi.fn<(a: string) => Promise<void>>()` takes one function type.

## Shared patterns (reuse; confirm with the user before inventing a divergent one)

- **Forms:** `app-form` (`[settingsCard]="true"` draws it as one card), or a plain `<form (ngSubmit)>` ending in
  `app-form-button-bar [mode]` with an `app-submit-button` (`src/receipts/receipt-form/` is the bespoke precedent). The
  button bar is inline at the end of the form, never floating; Save/Cancel never go in the page header. Fields grouped
  in `app-form-section`, bound via the `formGet` pipe.
- **`FormMode`:** in edit mode `app-submit-button` is dimmed while the form is pristine; add forms never are. State that
  is not a control (grants, Magic Fill) marks the form dirty. Settings forms are always editable.
- **Dialog forms** submit through `(ngSubmit)` only. `disableWhenProgressBarIsShown` protects nothing unless something
  dispatches `ShowProgressBar` (only Magic Fill does).
- **Validation messages** (`validation-messages.ts`) cover `required`, `email`, `min`, `max`, `minlength`,
  `maxlength`, `pattern`, `duplicate`. Any other key renders an empty message: return a string or `{ message, ...params }`
  from the validator, or pass `additionalErrorMessages`. `app-select` has no `hint` input.
- **Required fields shake:** `shakeInvalid()` / `shakeElement()` (`src/utils/shake.ts`) is the one way.
- **Passwords:** `app-input [showVisibilityEye]` / `[showGeneratePassword]`; generate only where an admin sets someone
  else's password, never sign-up or stored external secrets; `generateSecurePassword()` (`src/utils/password.utils.ts`).
- **Confirmations:** `ConfirmationDialogComponent` (inputs set on `componentInstance`, not dialog data); act on a truthy
  `afterClosed()`. Every write the user cannot trivially undo goes through it, Duplicate included. A delete passes
  `confirmText = marker("Delete")`, a removal `marker("Remove")` (`DESTRUCTIVE_CONFIRM_TEXTS`, red button).
- **Lists:** `app-table` with `BaseTableComponent` + a table service + an NGXS table state for server paging; row
  mutations refetch with `getTableData()`. Pass `emptyText` only once loaded. List pages use `app-table-header` and
  `app-add-button`; settings pages `app-settings-page` / `-section` / `-tabs` / `-entity-list` (`../DESIGN.md`).
- **Small pieces:** `app-badge`, `app-filter-bar`, `app-breadcrumb`, `app-status-chip`, `app-money`, `app-copy-button`
  (silent on failure by design; hand-roll a toasting copy where the value matters).
- **Grant picker** (`src/shared-ui/grant-picker/`): emits nothing while seeding, stops seeding once the user edits, and
  passes a unique `inputId` to its autocompletes (otherwise N pickers share one DOM id).
- **Chip pickers** (`app-autocomlete [multiple]`) push onto the control, so it must be a `FormArray` (a `FormControl`
  silently does nothing); clear with `FormArray.clear()`. Plain-string options need a `displayWith`.

## Dependencies (recipe and failure modes: `docs/lockfile.md`)

- Keep `npm audit` at 0. Transitive fixes go in `package.json` `overrides`; drop an override once it does nothing. An
  advisory with no patched release is fixed by removing the path that pulls it in.
- Builders are `@angular/build:*`; never add `@angular-devkit/build-angular`.
- **Never regenerate `package-lock.json` from scratch**; update incrementally with CI's Node and npm (`node-version` in
  `.github/workflows/ci.yml`). Gate every dependency change on `npm ci` (not `npm install`), audit, `test:ci`, build, and
  every package's `engines.node` admitting CI's Node.
- `@playwright/test` is pinned exactly; bump it with the browser build. `@zxing/*` pins can be lifted in a change of
  their own. Stay on Angular's 22.x patch line; 23 is its own upgrade.
- **Check a new dependency's `license` field before adding it, and after a major bump.** Charts are Chart.js (MIT)
  because apexcharts went source-available at 5.1 (a paid OEM licence to embed it in a product other people use, which
  also clashes with AGPL-3.0). Never let `npm update` or `audit fix` cross a licence change.

## Cross-cutting invariants

- **Permission gating** mirrors the server (which re-checks, so a stale button at worst 403s). `SetPermissions` is
  dispatched only from `setAppData` (`src/utils/app-data.utill.ts`), never from `TokenRefreshService`. The matcher
  `src/utils/permission.utils.ts` ports the Go matcher. Use `AuthState.hasAppPermission` / `hasGroupPermission`, the
  `*hasAppPermission` / `*hasGroupPermission` directives and `appPermissionGuard` / `groupPermissionGuard`.
- **Gate on the item's own group,** never the page's: the "All" group never appears in `groupPermissions`.
- **Permission strings stay `string[]`** on the wire, not the `Permission` enum (wildcards; closed enums broke older
  clients). `aiType` values live in `src/constants/ai-type.ts`, not the generated client.
- **403 handling** (`src/interceptors/http-interceptor.ts`): the API answers every denial with 403, never 401. A 403 is
  a permission denial: toast "Forbidden" for non-GET outside queue mode and re-throw; **never log out or refresh on it.**
- **One toast per error, and the server's `errorMsg` wins.** The generic `HttpErrorResponse.message` is a fallback
  only for a 5xx with no `errorMsg`. A form with two writes toasts success only after both land.
- **App time zone** (`SystemSettingsState.timeZone`, helpers in `src/utils/app-time-zone.ts`): display with the
  `appDate` pipe (never a bare `| date`; `:'calendar'` for calendar days), `formatAppDate` outside templates,
  `todayInZone(zone)` for today. Receipt dates go out as `toMidnightUtc` and load with `calendarDayToLocalDate`.
- **Wire dates are `yyyy-MM-dd`,** converted by `toDateWireFilter` at the request, never in the store (the persisted
  value goes back to the datepicker, which would read a bare day as UTC midnight).
- **Persisted filter state:** one slice per table; defaults from factories (`buildDefaultReceiptFilter()`), never a
  shared constant. **NGXS `@State` defaults never run for a hydrated slice,** so a key added later needs its fallback
  in the selector (and handlers). Every active filter condition gets a chip (`isFilterEntryActive`).
- **Submit `getRawValue()`, not `value`,** wherever controls can be disabled (a disabled control is omitted and the API
  then wipes the stored setting).
- **A blank select/autocomplete sentinel is `""`, never `0`** (`Validators.required` treats `0` as present). Seed the
  target group with `GroupState.soleGroupId` / `addTargetGroupId`, never the "All" group.
- **Receipt create is one call:** `ReceiptService.createReceiptWithFiles(form.value, files)`.
- **Durations are hours on the wire** (`src/utils/duration.utils.ts`). Convert a floor with `minForUnit`, never
  `maxForUnit`; seed retention as `splitHours(value || 720)`.
- **Calls that must skip the interceptors** (Open Food Facts, translation files) build their `HttpClient` on
  `HttpBackend`.

## Feature traps (the rest is in `docs/features.md`)

- **Translations:** the English text is the key (`{{ 'Add receipt' | t }}`, `marker("…")` in TypeScript). Values go in
  `{placeholders}`, never template literals or concatenation (`i18n:check` fails). After adding text run
  `npm run i18n:extract`, then `npm run i18n:sync -- --lang pl` and fill the `null`s; **Polish must stay at 100%**. A
  `{name}` cannot take a grammatical case: put it after a colon or a noun. An English text change is a key change:
  carry each language's value over. The language is never taken from the browser.
- **Service worker:** `serviceWorkerBypassInterceptor` stays first in `withInterceptors` (an upload through the worker
  cut its multipart body short). The worker has no `dataGroups`; a bad worker means a stuck app, so check
  `dist/cartvibe/browser/ngsw.json` after a build. `index.html`'s inline script hash is in `docker/default.conf`:
  recompute it when that script changes (`npm run check:csp` after a build; CI and the image build run it, and
  `.gitattributes` keeps `index.html` LF because the hash is over LF text). `app.config.ts` sets NGXS
  `strictContentSecurityPolicy` (no `new Function`): never add `'unsafe-eval'` to the policy.
- **Photo inputs** are native `<label>`s around hidden file inputs, never a button calling `input.click()` (mobile
  browsers ignore a click made after an `await`).
- **Receipt filter:** the dialog authors its own row labels, so a rename touches both `RECEIPT_FILTER_FIELDS` and
  `receipt-filter.component.html`.
- **Quick Scan:** resolve field config per image index on each call (removing an image shifts indexes); the comment
  validators are module-level singletons because `removeValidators` matches by reference.
- **Magic Fill:** Paid by needs `AutocomleteComponent.syncSingleDisplay()` after the patch; comments go through
  `ReceiptCommentsComponent.addMagicFilledComments()` (a receipt update does not persist comments).
- **Preferences saves send the whole object** (`PUT /userPreferences` replaces it); the Dashboard layout is its own
  endpoint for that reason.
- **Product checker:** no name search on purpose (Open Food Facts answers cross-site search with 503 and no CORS; a
  server relay was rejected). `localStorage` access is always guarded.
- **System Settings:** the form holds every control whatever the tab, so a save sends the whole payload; a new tab goes
  into `allTabs` and the landing guard order. Embedded tables sit outside the `<form>`.
- **Roles:** the UI offers Admin and User only; `RoleNamePipe` matches on id **and** scope (app and group ids collide).

## E2E (setup and per-spec notes: `docs/e2e.md`)

- Specs in `e2e/` need a live API. CI runs only the fully green ones (`npm run e2e:smoke`, the `e2e-smoke` job: the built
  image next to Valkey); a spec that passes locally joins that list in `package.json`. Many specs predate the family
  rework, so update a spec before trusting it.
- Select with `getByTestId` (`<resource>-<action>`) or by role/label; never structural CSS chains or styling classes.
- Web-first assertions only; never `waitForTimeout`. `fullyParallel` is on: mint unique data (`uniqueName`), never
  mutate shared rows; a spec that changes a global setting is serial and restores only the field it captured.
- Credentials come from `E2E_*` environment variables, never literals. Prove server enforcement with an API call that
  403s, not only a hidden control.

## Removed (do not resurrect without asking)

The Flutter app; Angular Material, Bootstrap and ngx-bootstrap; login QR; the role editor (`/roles`); OIDC admin UI and
login buttons; custom fields, the receipt summary, stored prompts, config import, system emails; items, shares and bill
splitting; per-group widget dashboards; the month stepper as a date control and the header search box; the
`showLargeImagePreviews` preference and the old image viewer.
