# Report Builder: deep notes

Purpose: the mechanics of `src/reports/` behind the summary in `../CLAUDE.md` → Reports. The engine and its wire
contract are in `api/CLAUDE.md` → "Reporting Engine" and "Report templates".

## Routes and access

- `ReportsModule` is lazy and gated by `appPermissionGuard` on `app.reports.read` or `app.reports.readAll`. `/reports`
  is the templates list; the builder is `/reports/new` and `/reports/:id/edit`, both with route data
  `fullHeight: true`.
- Per-template access is server-side: the list holds only templates the user may see, and each row's buttons gate on
  the server-computed `allowedActions`, never ANDed with a client permission check (that would hide a button from a
  holder of only the `*All` permission). Row Generate goes through `ReportRunnerService.generateFromTemplateById`
  (`POST /report/template/{id}/generate`, the enforcing endpoint).
- The builder's Generate is gated on `app.reports.generate` (the server also wants `group.reports.read` per group);
  the preview is not app-gated. The group picker lists only groups where the user holds `group.reports.read`.

## Builder state

- One reactive form (`models/report-form.factory.ts`) plus signals; no NGXS (the list's `ReportTemplateTableState` is
  the module's only slice). Generate and preview are one-shot calls through `ReportRunnerService` (generate → `Blob` →
  `downloadFile`, like `ReceiptExportService`).
- Field options come from `models/report-catalog.constants.ts` (`REPORT_BUILTIN_DIMENSIONS` / `_MEASURES`,
  `toFieldOptions`). `models/report-command.mapper.ts` maps the form to the generated `ReportRequestCommand`.
- Structural lists (scope, grouping, columns) mutate their `FormArray` and bump a `revision` signal so the `@for`s
  repaint under zoneless CD (dialog-driven changes run outside a template event).
- Multi-select filter controls (categories, tags, paid by) are `FormArray`s, because `app-autocomlete` pushes onto
  them.

## Open in builder (hydration)

`/reports/:id/edit` resolves the template first (`reportTemplateResolver`), and `buildReportFormFromCommand` builds the
form from the stored command: the inverse of `toReportRequestCommand`, round-trip tested, reusing
`buildReceiptFilterForm` for the filter. Building it in the field initializer (before the preview subscription
attaches) makes the loaded config preview exactly once.

- **Dates in templates are bare days.** Save maps date filters through `toDateWireFilter`; loading maps them back with
  `fromDateWireFilter` (a bare day becomes the datepicker's local midnight; a legacy stored instant loads as its first
  ten characters, the day the server generates it for). A re-save rewrites it as a bare day.
- **Filter rows:** the form holds every field; which rows show is a local `activeFieldKeys` signal, seeded on init from
  every field whose stored `operation` is non-empty. Without that seed a saved filter sits in the form with no row.

## Period date field

The "Date field" select chooses which receipt date the period filters on (`period.dateField`). Its options are
`RECEIPT_DATE_FILTER_FIELDS` as-is, so they match the receipts table's fields. A new report defaults to
`DEFAULT_QUICK_DATE_FIELD` and the mapper always sends the field. Rehydration goes through `toReportPeriodDateField`,
which falls back to the literal `LEGACY_REPORT_PERIOD_DATE_FIELD` (`"date"`), not the table default: templates saved
before the picker always ran on the receipt date, and a later default change must not move them. An unknown stored
value lands on `"date"` too.

## Preview and drill-in

- `report-preview-panel` debounces the form (~450 ms, `switchMap`) into `POST /report/preview` and renders the
  engine's HTML in a sandboxed `<iframe srcdoc>` (`sandbox="allow-same-origin"`, no scripts), sized to content.
- The `receiptCount` chip opens `report-receipts-dialog`, which makes one `POST /report/receipts` call with the
  preview's own command. It never resolves the period itself: a client-side BETWEEN once disagreed with the chip
  (browser time zone, SQLite text comparison of ISO bounds, the `-1` paid-by sentinel). The subtitle formats the period
  for display only, in the app time zone. Its count is the preview's `receiptCount` (falling back to `totalCount`); the
  server caps the list at 100, and a shorter list shows "Showing the newest N of M receipts"
  (`report-receipt-truncated`). Rows open a read-only detail; "Open full receipt" opens `/receipts/:id/view` in a new
  tab.

## Filters

`report-filters` uses the shared `buildReceiptFilterForm` and `OperationsPipe`, so it produces the same
`ReceiptPagedRequestFilter` as the receipts filter. Category and tag options are the union of the user's group
catalogs. The one divergence is paid by: an `app-autocomlete` over `paidByOptions()`, which prepends "Whoever
generates the report" (`REPORT_GENERATOR_PAID_BY_ID = -1`); the control stores plain ids, so a saved template carries
`-1` and the server resolves it to the generating user.

## Columns and grouping

- Columns are a `FormArray` edited through `column-picker-dialog` (dimension / aggregate / formula). A column's engine
  `name` (what formulas reference) is derived and stable across label edits (`report-column.util.ts`). Formula
  checking in the UI is light; the engine is the validator (400 via the interceptor). Reordering is up/down, no drag.
- **Both detail modes edit columns.** In Records mode a row is one receipt, so a dimension column reads any field and
  aggregates run per record. In Aggregate mode a dimension column is valid only for the `detail.by` field or a
  grouping level; an invalid one is **disabled**, not removed (`isDimensionColumnDisabled`): left out of
  preview/generate (`enabledReportColumns`), kept on save (`toReportRequestCommandForSave`), and re-enabled when the
  config makes it valid. Generate is blocked only when no enabled column remains.
- **Grouping levels are leading columns and can be renamed** with the same picker in locked-field mode
  (`ColumnPickerDialogData.lockField`: no Back, readonly field, title "Grouping column"). `groupBy` is a
  `FormArray<FormGroup>` of `{ field, label }`, so a heading moves and dies with its level; read keys with
  `readGroupByFields()`. A blank label means the catalog label (retyping the default resets it). The mapper emits
  `groupByLabels` (keyed by field) only when a level is renamed, so an untouched report maps exactly as before. The
  list's Grouping summary prefers the override.
- **Line fields:** Category, Tag, Health and Planned / Unplanned are read off product lines on the server; a receipt
  counts once per bucket it falls into. `paid_by` reads "Added by".

## Save and the templates list

- The generate bar's secondary button saves: on `/reports/new` it creates (`POST /report/template`, gated on
  `app.reports.create`, "Save Template"); on edit it updates in place (`PUT /report/template/{id}`, gated on
  `app.reports.update`, "Update Template"). The template name is the report name. Copying is the list's Duplicate.
- The list (`report-template-list/`) is a server-paged `app-table` (`BaseTableComponent` + `ReportTemplateTableService`
  + `ReportTemplateTableState`); only `name` and `updated_at` sort. Display strings come from the pure
  `report-template-summary.ts`, which takes its lookups as arguments. Row actions carry
  `data-testid="report-template-<action>"`; delete goes through `ConfirmationDialogComponent`. The empty state has its
  own add button (`report-template-add-empty`).

## Layout

The route's `fullHeight` flag makes `SidebarComponent` drop the shell padding and turn the content area into a bounded
flex column (`.drawer-content--full-height`) for that route only, so the config and preview panes scroll independently
under a pinned page bar and generate bar. Reuse the flag for any full-bleed page. Below 900px the panes stack and
scroll as one page. Config sections are `app-report-section`; Records / Aggregate is `app-settings-tabs` (its tabs keep
`report-detail-records` / `-aggregate` through `FilterTab.testId`).
